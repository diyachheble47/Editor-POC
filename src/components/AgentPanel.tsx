import { useEffect, useRef, useState } from 'react'
import type { AiBlock } from '../storage/api'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createParagraphNode, $getRoot, $parseSerializedNode } from 'lexical'
import type { LexicalEditor, SerializedLexicalNode } from 'lexical'
import { useDocument } from '../context/DocumentContext'
import { useEditorUI } from '../editor/context/EditorUIContext'
import type { AgentSession } from '../editor/context/EditorUIContext'
import { editorConfig } from '../editor/EditorConfig'
import { createAiStreamBuilder } from '../editor/aiStreamBuilder'
import { ApiError, getAiStatus, streamAiDocument } from '../storage/api'
import type { AiKind, AiRequest } from '../storage/api'
import { KINDS } from './AiGenerateDialog'

function blockLabel(block: AiBlock): string {
  switch (block.type) {
    case 'heading': return 'Heading'
    case 'paragraph': return 'Paragraph'
    case 'list': return block.ordered ? 'Numbered list' : 'Bullet list'
    case 'table': return `Table (${block.rows.length} rows)`
    case 'circuit': return 'Circuit'
    case 'molecule': return `Molecule (${block.name})`
    case 'graph': return 'Graph'
    default: return block.type[0].toUpperCase() + block.type.slice(1)
  }
}

type Phase = 'form' | 'generating' | 'review' | 'done'

// Hands the preview editor to the panel (it lives inside its own composer).
function CaptureEditor({ onEditor }: { onEditor: (e: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => { onEditor(editor) }, [editor, onEditor])
  return null
}

/**
 * The /agent panel.
 * - Empty document: ask what to make (title, description, type) and write it
 *   straight into the document.
 * - Document with content: the document is the context. The result is built in
 *   a read-only preview here; nothing touches the document until Accept.
 */
export function AgentPanel({ session }: { session: AgentSession }) {
  const [mainEditor] = useLexicalComposerContext()
  const { update } = useEditorUI()
  const { title: docTitle, setTitle, markDirty, setAiState, aiAbortRef } = useDocument()
  const [kind, setKind] = useState<AiKind>('lesson')
  const [title, setTitleInput] = useState('')
  const [description, setDescription] = useState('')
  const [phase, setPhase] = useState<Phase>('form')
  const [error, setError] = useState<string | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const previewRef = useRef<LexicalEditor | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const blocksRef = useRef(0)
  // Live progress of the running generation: what has arrived so far.
  const [steps, setSteps] = useState<string[]>([])
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => { void getAiStatus().then(setConfigured) }, [])
  useEffect(() => () => { abortRef.current?.abort() }, [])

  useEffect(() => {
    if (phase !== 'generating') return
    const started = Date.now()
    setElapsed(0)
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500)
    return () => clearInterval(t)
  }, [phase])

  const close = () => { abortRef.current?.abort(); update({ agent: null }) }

  async function generate() {
    const target = session.empty ? mainEditor : previewRef.current
    if (!target) return
    const request: AiRequest = session.empty
      ? { title: title.trim(), description: description.trim(), kind }
      : {
          title: docTitle.trim() || 'Untitled',
          description: description.trim(),
          context: session.context,
          kind,
        }
    const ai = new AbortController()
    abortRef.current = ai
    blocksRef.current = 0
    setSteps([])
    setError(null)
    setPhase('generating')
    const builder = createAiStreamBuilder(target)
    if (session.empty) {
      mainEditor.setEditable(false)
      aiAbortRef.current = () => ai.abort()
      setAiState({ status: 'generating', message: null, startedAt: Date.now() })
    }
    target.update(() => { $getRoot().clear() }, { discrete: true })
    let failure: string | null = null
    try {
      await streamAiDocument(request, event => {
        if (event.t === 'error') { failure = event.message; return }
        if (event.t === 'open' || event.t === 'block') {
          blocksRef.current++
          const label = blockLabel(event.block)
          setSteps(prev => [...prev.slice(-199), label])
        }
        builder.apply(event)
      }, ai.signal)
    } catch (err) {
      if (!ai.signal.aborted) {
        failure = err instanceof ApiError && err.status === 503
          ? 'The AI is not set up yet: add GEMINI_API_KEY to backend/.env and restart the backend.'
          : 'Could not reach the AI service. Check that the backend is running.'
      }
    }
    if (session.empty) {
      aiAbortRef.current = null
      builder.finish()
      mainEditor.setEditable(true)
      if (blocksRef.current > 0) {
        markDirty()
        if (!docTitle.trim() || docTitle === 'Untitled') setTitle(title.trim())
      }
      setAiState(failure ? { status: 'error', message: failure } : { status: 'idle', message: null })
    }
    if (ai.signal.aborted && abortRef.current !== ai) return // panel closed
    if (failure) setError(failure)
    setPhase(blocksRef.current === 0 ? 'form' : session.empty ? 'done' : 'review')
  }

  function accept() {
    const preview = previewRef.current
    if (!preview) return
    const nodes = preview.getEditorState().toJSON().root.children as SerializedLexicalNode[]
    mainEditor.update(() => {
      const root = $getRoot()
      // Drop a lone empty paragraph at the end so the new content follows directly.
      const last = root.getLastChild()
      if (last && last.getType() === 'paragraph' && last.getTextContent() === '' && root.getChildrenSize() > 1) last.remove()
      for (const json of nodes) {
        try { root.append($parseSerializedNode(json)) } catch { /* a block that can't be rebuilt is left out */ }
      }
      root.append($createParagraphNode())
    }, { discrete: true })
    markDirty()
    update({ agent: null })
  }

  const decline = () => {
    previewRef.current?.update(() => { $getRoot().clear() }, { discrete: true })
    update({ agent: null })
  }

  const canGenerate = configured !== false && (!session.empty || title.trim().length > 0)
  const showForm = phase === 'form'

  return (
    <div className="agent-panel">
      <div className="agent-panel-head">
        <h2>✨ AI Agent</h2>
        <button type="button" className="agent-panel-x" onClick={close} aria-label="Close agent">✕</button>
      </div>

      {showForm && (
        <form className="agent-panel-form" onSubmit={e => { e.preventDefault(); if (canGenerate) void generate() }}>
          <p className="agent-panel-sub">
            {session.empty
              ? 'The document is empty. Say what to create and it will be written straight into it.'
              : 'Uses what is already in this document as its source. The result appears below for you to review. Nothing changes until you accept.'}
          </p>

          <fieldset className="ai-dialog-kinds">
            <legend>Create</legend>
            {KINDS.map(k => (
              <label key={k.value} className={`ai-dialog-kind${kind === k.value ? ' selected' : ''}`}>
                <input type="radio" name="agent-kind" checked={kind === k.value} onChange={() => setKind(k.value)} />
                <span className="ai-dialog-kind-label">{k.label}</span>
                <span className="ai-dialog-kind-hint">{k.hint}</span>
              </label>
            ))}
          </fieldset>

          {session.empty && (
            <label className="ai-dialog-field">
              <span>Title</span>
              <input autoFocus value={title} maxLength={120} onChange={e => setTitleInput(e.target.value)}
                placeholder="e.g. Acids, bases and salts" />
            </label>
          )}
          <label className="ai-dialog-field">
            <span>{session.empty ? 'Description' : 'Instructions'} <em>(optional)</em></span>
            <textarea value={description} maxLength={2000} rows={4} onChange={e => setDescription(e.target.value)}
              placeholder={session.empty ? 'Class, level, what to cover…' : 'e.g. Grade 9, focus on numericals…'} />
          </label>

          {configured === false && (
            <p className="ai-dialog-warn" role="alert">The AI isn&apos;t set up yet. Add GEMINI_API_KEY to backend/.env and restart the backend.</p>
          )}
          {error && <p className="ai-dialog-warn" role="alert">{error}</p>}

          <button type="submit" className="ai-dialog-submit agent-panel-go" disabled={!canGenerate}>Generate</button>
        </form>
      )}

      {phase === 'generating' && (
        <div className="agent-progress" role="status">
          <div className="agent-panel-status">
            <span>
              {steps.length === 0
                ? `Request sent, waiting for the AI… ${elapsed}s`
                : `Generating… ${steps.length} block${steps.length === 1 ? '' : 's'} · ${elapsed}s`}
            </span>
            <button type="button" className="ai-dialog-cancel" onClick={() => abortRef.current?.abort()}>Stop</button>
          </div>
          {session.empty && steps.length > 0 && (
            <ol className="agent-steps" aria-label="Blocks received">
              {steps.slice(-8).map((label, i) => <li key={steps.length - Math.min(8, steps.length) + i}>✓ {label}</li>)}
            </ol>
          )}
        </div>
      )}

      {phase === 'done' && (
        <div className="agent-panel-status">
          <span>Written to the document. Review it, then press Save.</span>
          <button type="button" className="ai-dialog-submit" onClick={close}>Close</button>
        </div>
      )}

      {/* The preview editor must exist before Generate is pressed (generate() builds
          into it), so it is always mounted and only hidden while the form shows. */}
      {!session.empty && (
        <>
          <div className="agent-preview" hidden={showForm}>
            <LexicalComposer initialConfig={{ ...editorConfig, namespace: 'agent-preview', editable: false }}>
              <RichTextPlugin
                contentEditable={<ContentEditable className="editor-input agent-preview-input" aria-label="Generated preview" />}
                placeholder={null}
                ErrorBoundary={LexicalErrorBoundary}
              />
              <ListPlugin />
              <CaptureEditor onEditor={e => { previewRef.current = e }} />
            </LexicalComposer>
          </div>
          {phase === 'review' && (
            <div className="agent-panel-actions">
              {error && <p className="ai-dialog-warn" role="alert">{error}</p>}
              <button type="button" className="ai-dialog-cancel" onClick={decline}>Decline</button>
              <button type="button" className="ai-dialog-submit" onClick={accept}>Accept</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
