import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiBlock, AiChatMessage } from '../storage/api'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createParagraphNode, $createTextNode, $getNodeByKey, $getRoot, $parseSerializedNode } from 'lexical'
import type { LexicalEditor, SerializedLexicalNode } from 'lexical'
import { useDocument } from '../context/DocumentContext'
import { useEditorUI } from '../editor/context/EditorUIContext'
import type { AgentSession } from '../editor/context/EditorUIContext'
import { editorConfig } from '../editor/EditorConfig'
import { createAiStreamBuilder } from '../editor/aiStreamBuilder'
import { buildEditContext, isDocEmpty } from '../editor/ai/editContext'
import { ApiError, getAiChat, getAiStatus, MAX_AI_CHAT_MESSAGES, saveAiChat, streamAiDocument } from '../storage/api'
import type { AiKind, AiRequest } from '../storage/api'
import { AI_CHAT_EVENT } from '../editor/ai/generateBlock'
import type { AiChatEvent } from '../editor/ai/generateBlock'

function blockLabel(block: AiBlock): string {
  switch (block.type) {
    case 'keep': return 'Kept block'
    case 'section': return 'Section'
    case 'toc': return 'Contents'
    case 'heading': return 'Heading'
    case 'paragraph': return 'Paragraph'
    case 'list': return block.ordered ? 'Numbered list' : 'Bullet list'
    case 'table': return `Table (${block.rows.length} rows)`
    case 'circuit': return 'Circuit'
    case 'drawing': return 'Drawing'
    case 'molecule': return `Molecule (${block.name})`
    case 'graph': return 'Graph'
    default: return block.type[0].toUpperCase() + block.type.slice(1)
  }
}

// The chat only edits the open document. Workbook, lesson builder and lesson
// plan are not offered here (they are separate flows, not chat modes).
const MODES: { kind: AiKind; label: string; hint: string; placeholder: string }[] = [
  { kind: 'edit', label: 'Edit document', hint: 'Change this document as you describe', placeholder: 'What should change? e.g. make question 3 easier, add a chart of the data…' },
]
const KIND_NAME: Record<AiKind, string> = { edit: 'Edit', workbook: 'Workbook', lesson: 'Lesson builder', lesson_plan: 'Lesson plan' }

/** The small label at the top of a generated document: its type, styled as a kicker, not a heading. */
function kindKickerNode(name: string) {
  const paragraph = $createParagraphNode()
  paragraph.setStyle('font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--c-text-3, #6b7280); margin-bottom: 0.25rem')
  paragraph.append($createTextNode(name))
  return paragraph
}

const STATUS_TEXT: Record<NonNullable<AiChatMessage['status']>, string> = {
  accepted: 'Applied to the document',
  declined: 'Not applied',
  written: 'Written to the document',
  error: '',
}

type Phase = 'idle' | 'generating' | 'review'
/** What Accept does with the preview: add it to the end, or replace the whole document (edit). */
type Pending = { how: 'append' | 'replace'; msgId: string; snapshot: string; /** Edit of a selection: only these blocks are replaced. */ keys?: string[] }

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

// Hands the preview editor to the panel (it lives inside its own composer).
function CaptureEditor({ onEditor }: { onEditor: (e: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => { onEditor(editor) }, [editor, onEditor])
  return null
}

/** The first part of what an editor holds, as one short plain-text snippet. */
function peekOf(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => $getRoot().getTextContent()).replace(/\s+/g, ' ').trim().slice(0, 400)
}

/**
 * The AI Agent side panel: a chat for the open document.
 * - Create (workbook / lesson builder / lesson plan): on an empty document the
 *   result is written straight into it; otherwise it is built in a preview here
 *   and added to the end of the document on Accept.
 * - Edit: the AI revises the document; the preview replaces it on Accept (Undo
 *   brings the old version back). Graphs, images and other non-text blocks are
 *   carried over untouched.
 * The conversation is saved with the document and comes back when it is reopened.
 */
export function AgentPanel({ session }: { session: AgentSession }) {
  const [mainEditor] = useLexicalComposerContext()
  const { update } = useEditorUI()
  const { activeDocId, title: docTitle, setTitle, markDirty, setAiState, aiAbortRef } = useDocument()

  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  // Opened from selected text: the edit applies to these blocks only.
  const [scope, setScope] = useState(session.scope ?? null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [steps, setSteps] = useState<string[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [writesToDoc, setWritesToDoc] = useState(false)
  const [docEmpty, setDocEmpty] = useState(() => isDocEmpty(mainEditor))

  const previewRef = useRef<LexicalEditor | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const blocksRef = useRef(0)
  const startedRef = useRef(false)
  const threadRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef(messages)
  const changedRef = useRef(false)
  const docIdRef = useRef(activeDocId)
  messagesRef.current = messages

  const push = useCallback((...added: AiChatMessage[]) => {
    changedRef.current = true
    setMessages(prev => [...prev, ...added].slice(-MAX_AI_CHAT_MESSAGES))
  }, [])
  const patch = useCallback((id: string, change: Partial<AiChatMessage>) => {
    changedRef.current = true
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...change } : m)))
  }, [])

  // Selecting more text and pressing ✨ while the panel is open just changes the scope.
  useEffect(() => {
    if (!session.scope) return
    setScope(session.scope)
    inputRef.current?.focus()
  }, [session.scope])

  useEffect(() => { void getAiStatus().then(setConfigured) }, [])
  useEffect(() => () => { abortRef.current?.abort() }, [])

  // Restore this document's conversation. A result that was still waiting for
  // Accept when the panel closed can't be applied any more, so it reads as "not applied".
  useEffect(() => {
    let live = true
    getAiChat(docIdRef.current)
      .then(saved => {
        if (!live) return
        setMessages(saved.map(m => (m.role === 'assistant' && m.status == null ? { ...m, status: 'declined' as const } : m)))
      })
      .catch(() => { /* no history yet, or the backend is offline */ })
      .finally(() => { if (live) setLoaded(true) })
    return () => { live = false }
  }, [])

  // Slash-menu Generate runs outside this panel; its result lands here too so the chat has the full history.
  useEffect(() => {
    if (!loaded) return
    const onChat = (e: Event) => {
      const detail = (e as CustomEvent<AiChatEvent>).detail
      if (detail.docId !== docIdRef.current) return
      detail.handled = true
      push(...detail.messages)
    }
    window.addEventListener(AI_CHAT_EVENT, onChat)
    return () => window.removeEventListener(AI_CHAT_EVENT, onChat)
  }, [loaded, push])

  // Save the conversation shortly after it changes, and once more when the panel goes away.
  useEffect(() => {
    if (!loaded || !changedRef.current) return
    const t = setTimeout(() => {
      changedRef.current = false
      void saveAiChat(docIdRef.current, messages).catch(() => { changedRef.current = true })
    }, 600)
    return () => clearTimeout(t)
  }, [messages, loaded])
  useEffect(() => () => {
    if (changedRef.current) void saveAiChat(docIdRef.current, messagesRef.current).catch(() => {})
  }, [])

  useEffect(() => {
    if (phase !== 'generating') return
    const started = Date.now()
    setElapsed(0)
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500)
    return () => clearInterval(t)
  }, [phase])

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, steps.length, phase])

  const close = () => { abortRef.current?.abort(); update({ agent: null }) }

  // `allowEmptyEdit`: the slash menu's "Generate" also runs as kind 'edit'
  // (add one new block, keep the rest — the same "keep/add" mechanism this
  // panel's own Edit mode uses), but unlike that mode, Generate makes just as
  // much sense on a blank document (there's simply nothing to keep) as on a
  // full one. buildEditContext already handles an empty document fine (zero
  // "keep" lines, text: ''); the block below exists only to redirect a
  // *person* who picked Edit mode on nothing toward Workbook/Lesson instead,
  // so Generate opts out of it rather than hitting that same refusal.
  // `singleBlock`: the instruction crafted for Generate ("insert exactly one
  // new X block...") is just text in the prompt — the model following it is
  // a request, not a guarantee, and it has been observed ignoring it and
  // writing a whole document instead. This enforces it for real: once one
  // new (non-"keep") block has landed, any further new block is dropped.
  // The stream itself is NOT aborted early, even though the one block we
  // want has already arrived — 'edit' only gets the rest of the ORIGINAL
  // document right by the model re-echoing every remaining block as a
  // "keep" line in order; cutting the stream off partway through that
  // (confirmed live: it silently drops every block after the cut) loses
  // whatever the model hadn't gotten to yet, which is worse than the
  // problem this is fixing.
  const send = useCallback(async (kind: AiKind, rawPrompt: string, allowEmptyEdit = false, singleBlock = false, sources?: { name: string; text: string }[]) => {
    const prompt = rawPrompt.trim()
    if (!prompt || abortRef.current) return
    const empty = isDocEmpty(mainEditor)
    setDocEmpty(empty)
    const scoped = kind === 'edit' ? scope : null
    const asked: AiChatMessage = { id: uid(), role: 'user', text: scoped ? `On: “${scoped.text}”\n${prompt}` : prompt, kind, at: Date.now() }

    if (kind === 'edit' && empty && !allowEmptyEdit) {
      push(asked, { id: uid(), role: 'assistant', text: 'The document is empty, so there is nothing to edit yet. Add some content first, then ask for changes.', status: 'error', at: Date.now() })
      return
    }
    // The selected blocks that still exist (the document may have changed since).
    const scopeKeys = scoped ? mainEditor.getEditorState().read(() => scoped.keys.filter(k => $getNodeByKey(k) !== null)) : undefined
    if (scoped && scopeKeys?.length === 0) {
      push(asked, { id: uid(), role: 'assistant', text: 'The selected text is no longer in the document. Select it again and press ✨ AI.', status: 'error', at: Date.now() })
      setScope(null)
      return
    }
    const edit = kind === 'edit' ? buildEditContext(mainEditor, scopeKeys) : null
    if (edit?.tooLong) {
      push(asked, { id: uid(), role: 'assistant', text: 'This document is too long for the AI to edit in one go. Select a shorter document, or create new content instead.', status: 'error', at: Date.now() })
      return
    }

    const direct = empty && !edit // write straight into the (empty) document
    const target = direct ? mainEditor : previewRef.current
    if (!target) return

    const request: AiRequest = edit
      ? { title: docTitle.trim() || 'Untitled', kind, context: edit.text,
          description: scoped ? `${prompt}\n\nThe teacher selected this text. Apply the instruction to the blocks given (the selected part) only: "${scoped.text}"` : prompt }
      : direct
        ? { title: prompt.slice(0, 120), description: prompt.length > 120 ? prompt : '', kind, sources }
        : { title: docTitle.trim() || 'Untitled', description: prompt, kind, sources }

    const ai = new AbortController()
    abortRef.current = ai
    blocksRef.current = 0
    setSteps([])
    setWritesToDoc(direct)
    setPhase('generating')
    push(asked)
    const snapshot = edit ? (scopeKeys ? JSON.stringify(edit.originals) : JSON.stringify(mainEditor.getEditorState().toJSON())) : ''
    const builder = createAiStreamBuilder(target)
    if (direct) {
      mainEditor.setEditable(false)
      aiAbortRef.current = () => ai.abort()
      setAiState({ status: 'generating', message: null, startedAt: Date.now() })
    }
    target.update(() => {
      $getRoot().clear()
      // Create requests open with a small kicker ("WORKBOOK", "LESSON PLAN"), not a heading.
      if (kind !== 'edit') $getRoot().append(kindKickerNode(KIND_NAME[kind]))
    }, { discrete: true, tag: 'skip-scroll-into-view' })

    let failure: string | null = null
    let newBlocks = 0 // non-"keep" blocks actually started, only tracked/capped when singleBlock
    try {
      await streamAiDocument(request, event => {
        if (event.t === 'error') { failure = event.message; return }
        if (event.t === 'open' || event.t === 'block') {
          blocksRef.current++
          const label = blockLabel(event.block)
          setSteps(prev => [...prev.slice(-199), label])
          if (event.t === 'block' && event.block.type === 'keep') {
            // "Leave block N as it was": rebuild the original, untouched.
            const original = edit?.originals[event.block.ref]
            if (original) {
              target.update(() => {
                try { $getRoot().append($parseSerializedNode(original)) } catch { /* left out */ }
              }, { discrete: true, tag: 'skip-scroll-into-view' })
            }
            return
          }
          if (singleBlock) {
            newBlocks++
            if (newBlocks > 1) return // already have our one block — drop anything after it
          }
        }
        builder.apply(event)
      }, ai.signal)
    } catch (err) {
      if (!ai.signal.aborted) {
        failure = err instanceof ApiError && err.status === 503
          ? 'The AI is not set up yet: add GEMINI_API_KEY to backend/.env and restart the backend.'
          : err instanceof ApiError && err.status === 422
            ? 'The AI could not take that request. Try rewording it.'
            : 'Could not reach the AI service. Check that the backend is running.'
      }
    }
    const stopped = ai.signal.aborted
    if (direct) {
      aiAbortRef.current = null
      builder.finish()
      mainEditor.setEditable(true)
      if (blocksRef.current > 0) {
        markDirty()
        if (!docTitle.trim() || docTitle === 'Untitled') setTitle(prompt.slice(0, 80))
      }
      setAiState(failure ? { status: 'error', message: failure } : { status: 'idle', message: null })
    } else {
      builder.finish()
    }
    abortRef.current = null
    setDocEmpty(isDocEmpty(mainEditor))

    const n = blocksRef.current
    const s = n === 1 ? '' : 's'
    if (n === 0 || (failure && !direct)) {
      push({ id: uid(), role: 'assistant', text: failure ?? (stopped ? 'Stopped.' : 'The AI returned nothing usable. Try again.'), status: 'error', at: Date.now() })
      setPhase('idle')
      return
    }
    if (direct) {
      push({ id: uid(), role: 'assistant', kind, status: 'written', at: Date.now(),
        text: `${KIND_NAME[kind]} written to the document (${n} block${s}).${failure ? ` Stopped early: ${failure}` : stopped ? ' Stopped early.' : ' Review it, then press Save.'}` })
      setPhase('idle')
      return
    }
    const msgId = uid()
    pendingRef.current = { how: edit ? 'replace' : 'append', msgId, snapshot, keys: scopeKeys }
    push({ id: msgId, role: 'assistant', kind, status: null, at: Date.now(), peek: peekOf(target),
      text: scopeKeys
        ? `Here is the revised selection (${n} block${s}). Accept replaces only the selected part. Undo brings it back.`
        : edit
        ? `Here is the revised document (${n} block${s}). Accept replaces the current one. Undo brings it back.`
        : `${KIND_NAME[kind]} ready (${n} block${s}). Accept adds it to the end of the document.` })
    setPhase('review')
  }, [mainEditor, docTitle, scope, push, setTitle, markDirty, setAiState, aiAbortRef])

  // Started from the /agent dropdown: run once the saved conversation is in.
  useEffect(() => {
    if (!loaded || !session.run || startedRef.current) return
    startedRef.current = true
    void send(session.run.kind, session.run.prompt, session.run.allowEmpty, session.run.singleBlock, session.run.sources)
  }, [loaded, session.run, send])

  function accept() {
    const preview = previewRef.current
    const pending = pendingRef.current
    if (!preview || !pending) return
    const current = pending.keys
      ? JSON.stringify(buildEditContext(mainEditor, pending.keys).originals)
      : JSON.stringify(mainEditor.getEditorState().toJSON())
    if (pending.how === 'replace' && current !== pending.snapshot &&
        !window.confirm(`${pending.keys ? 'The selected text' : 'The document'} changed after you asked for this edit. Replace it anyway? Your newer changes will be lost (Undo restores them).`)) return
    let nodes = preview.getEditorState().toJSON().root.children as SerializedLexicalNode[]
    if (pending.keys) {
      // The preview ends with an empty paragraph meant for typing; a selection edit doesn't want it.
      const last = nodes[nodes.length - 1] as { type: string; children?: unknown[] } | undefined
      if (last && last.type === 'paragraph' && !last.children?.length) nodes = nodes.slice(0, -1)
      mainEditor.update(() => {
        const old = pending.keys!.map(k => $getNodeByKey(k)).filter(n => n !== null)
        if (old.length === 0) return
        for (const json of nodes) {
          try { old[0].insertBefore($parseSerializedNode(json)) } catch { /* a block that can't be rebuilt is left out */ }
        }
        for (const n of old) n.remove()
      }, { discrete: true, tag: ['skip-dom-selection', 'skip-scroll-into-view'] })
      setScope(null)
    } else {
      mainEditor.update(() => {
        const root = $getRoot()
        if (pending.how === 'replace') {
          root.clear()
        } else {
          // Drop a lone empty paragraph at the end so the new content follows directly.
          const last = root.getLastChild()
          if (last && last.getType() === 'paragraph' && last.getTextContent() === '' && root.getChildrenSize() > 1) last.remove()
        }
        for (const json of nodes) {
          try { root.append($parseSerializedNode(json)) } catch { /* a block that can't be rebuilt is left out */ }
        }
        root.append($createParagraphNode())
      }, { discrete: true, tag: ['skip-dom-selection', 'skip-scroll-into-view'] })
    }
    markDirty()
    patch(pending.msgId, { status: 'accepted' })
    finishReview()
    // Accepting changes the document, but the person is still typing to the AI: keep the cursor here.
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
  }

  function decline() {
    const pending = pendingRef.current
    if (pending) patch(pending.msgId, { status: 'declined' })
    finishReview()
  }

  function finishReview() {
    previewRef.current?.update(() => { $getRoot().clear() }, { discrete: true })
    pendingRef.current = null
    setDocEmpty(isDocEmpty(mainEditor))
    setPhase('idle')
  }

  // Always an edit: on an empty document the edit writes the new content straight in (as Generate does).
  const effectiveMode: AiKind = 'edit'
  const modeDef = MODES[0]
  // Waiting on Accept / Decline doesn't lock the composer: a new instruction just replaces that result.
  const busy = phase === 'generating'
  const canSend = loaded && !busy && configured !== false && draft.trim().length > 0

  function submit() {
    if (!canSend) return
    const text = draft
    setDraft('')
    if (phase === 'review') decline()
    void send(effectiveMode, text, true)
  }

  const showPreview = phase === 'review' || (phase === 'generating' && !writesToDoc)

  return (
    <div className="agent-panel">
      <div className="agent-panel-head">
        <h2>✨ AI Agent</h2>
        <button type="button" className="agent-panel-x" onClick={close} aria-label="Close agent">✕</button>
      </div>

      <div className="agent-thread" ref={threadRef}>
        {messages.length === 0 && phase === 'idle' && (
          <div className="agent-empty">
            <p>{docEmpty
              ? 'This document is empty. Say what to create and it is written straight into it.'
              : 'Ask the AI to edit this document, or to create something new from it. Nothing changes until you accept.'}</p>
            <ul>
              {docEmpty
                ? <><li>A heading and a short introduction</li><li>A quiz with three questions</li></>
                : <><li>Make the questions easier and add an answer key</li><li>Add a chart comparing the data in the table</li></>}
            </ul>
          </div>
        )}

        {messages.map(m => (
          <div key={m.id} className={`agent-msg agent-msg-${m.role}${m.status === 'error' ? ' error' : ''}`}>
            {m.role === 'user' && m.kind && <span className="agent-msg-kind">{KIND_NAME[m.kind]}</span>}
            <div className="agent-msg-text">{m.text}</div>
            {m.peek && <p className="agent-msg-peek">{m.peek}</p>}
            {m.role === 'assistant' && m.status && m.status !== 'error' && (
              <span className={`agent-msg-status ${m.status}`}>{STATUS_TEXT[m.status]}</span>
            )}
          </div>
        ))}

        {phase === 'generating' && (
          <div className="agent-msg agent-msg-assistant agent-progress" role="status">
            <div className="agent-panel-status">
              <span>
                {steps.length === 0
                  ? `Request sent, waiting for the AI… ${elapsed}s`
                  : `Generating… ${steps.length} block${steps.length === 1 ? '' : 's'} · ${elapsed}s`}
              </span>
              <button type="button" className="ai-dialog-cancel" onClick={() => abortRef.current?.abort()}>Stop</button>
            </div>
            {writesToDoc && steps.length > 0 && (
              <ol className="agent-steps" aria-label="Blocks received">
                {steps.slice(-8).map((label, i) => <li key={steps.length - Math.min(8, steps.length) + i}>✓ {label}</li>)}
              </ol>
            )}
          </div>
        )}

        {/* The preview editor must exist before a generation starts (it builds into
            it), so it is always mounted and only hidden when there is nothing to show. */}
        <div className="agent-preview" hidden={!showPreview}>
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
            <button type="button" className="ai-dialog-cancel" onClick={decline}>Decline</button>
            <button type="button" className="ai-dialog-submit" onClick={accept}>
              {pendingRef.current?.keys ? 'Replace selection' : pendingRef.current?.how === 'replace' ? 'Accept and replace' : 'Accept'}
            </button>
          </div>
        )}
      </div>

      <form className="agent-composer" onSubmit={e => { e.preventDefault(); submit() }}>
        {configured === false && (
          <p className="ai-dialog-warn" role="alert">The AI isn&apos;t set up yet. Add GEMINI_API_KEY to backend/.env and restart the backend.</p>
        )}
        {scope && (
          <div className="agent-scope" title={scope.text}>
            <span className="agent-scope-text">Editing selection: “{scope.text}”</span>
            <button type="button" className="agent-scope-x" onClick={() => setScope(null)} aria-label="Edit the whole document instead" disabled={busy}>✕</button>
          </div>
        )}
        <div className="agent-composer-field">
          <textarea
            value={draft}
            rows={2}
            maxLength={2000}
            ref={inputRef}
            placeholder={scope && effectiveMode === 'edit' ? 'What should change in the selection? e.g. make it simpler, add an example…' : modeDef.placeholder}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
            aria-label={`Instructions for the AI (${modeDef.label})`}
          />
          {draft.trim() && (
            <button type="submit" className="agent-menu-run" disabled={!canSend}>
              Run <span className="agent-run-enter" aria-hidden="true">↵</span>
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
