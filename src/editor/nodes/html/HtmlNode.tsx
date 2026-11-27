// HtmlNode — an interactive HTML block (a simulation, a drag-and-drop game, a poll...).
// The teacher writes or pastes the code, or asks the AI for it, and sees it run
// live. It always runs in a locked iframe (see htmlSandbox.ts). The node keeps the
// code, a title and a stable id (which later lets student activity be tied to this block).

import { DecoratorNode } from 'lexical'
import type { EditorConfig, LexicalEditor, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useBlockData } from '../_shared/useBlockData'
import { useTheme } from '../../../context/ThemeContext'
import { useDocument } from '../../../context/DocumentContext'
import { generateHtmlWidget } from '../../../storage/api'
import { ApiError } from '../../../storage/api'
import { HtmlCodeEditor } from './HtmlCodeEditor'
import { MAX_HTML, SANDBOX, THEME_VARS, buildSrcDoc, clampHeight, newBlockId, usesThree } from './htmlSandbox'
import { loadThree } from './threeSource'

export type HtmlData = { code: string; title: string; blockId: string }
export type SerializedHtmlNode = Spread<HtmlData, SerializedLexicalNode>

/** Runs `code` in the sandbox; sizes itself to the content. `run` restarts it. */
function SandboxFrame({ code, blockId, run = 0, minHeight = 80 }: { code: string; blockId: string; run?: number; minHeight?: number }) {
  const { theme } = useTheme()
  const [vars, setVars] = useState<Record<string, string> | null>(null)
  const [height, setHeight] = useState(minHeight)
  const [loaded, setLoaded] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)

  // Read the colours once the theme attribute has changed on <html>.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const cs = getComputedStyle(document.documentElement)
      setVars(Object.fromEntries(THEME_VARS.map(v => [v, cs.getPropertyValue(v).trim()]).filter(([, v]) => v)))
    })
    return () => cancelAnimationFrame(id)
  }, [theme])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return // only our own iframe
      const d = e.data as { tnb?: number; id?: string; type?: string; height?: number } | null
      if (!d || d.tnb !== 1 || d.id !== blockId) return
      if (d.type === 'resize' && typeof d.height === 'number' && Number.isFinite(d.height)) {
        const next = clampHeight(d.height)
        setHeight(h => (Math.abs(h - next) > 2 ? next : h))
      }
      // d.type === 'event' (tnb.emit) is where activity tracking will plug in later.
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [blockId])

  // Waits for the theme colours so the widget never flashes in the wrong ones.
  // A page that draws with three.js gets the library inlined; wait for it so the page never runs without it.
  const needsThree = useMemo(() => usesThree(code), [code])
  const [three, setThree] = useState<string | null>(null)
  useEffect(() => {
    if (!needsThree) return
    let live = true
    void loadThree().then(src => { if (live) setThree(src) }).catch(() => { if (live) setThree('/* three.js failed to load */') })
    return () => { live = false }
  }, [needsThree])
  const ready = vars && (!needsThree || three)
  const srcDoc = useMemo(() => (ready && vars ? buildSrcDoc(code, vars, blockId, needsThree ? three ?? undefined : undefined) : ''), [code, vars, blockId, ready, needsThree, three])
  useEffect(() => { setLoaded(false) }, [srcDoc, run])
  return (
    <div className="html-stage" style={{ minHeight: Math.max(minHeight, height) }}>
      {!loaded && <div className="html-skeleton" aria-hidden="true" />}
      {ready && (
        <iframe
          key={run}
          ref={frame}
          className="html-frame"
          title="Interactive activity"
          sandbox={SANDBOX}
          srcDoc={srcDoc}
          onLoad={() => setLoaded(true)}
          style={{ height: Math.max(minHeight, height), opacity: loaded ? 1 : 0 }}
        />
      )}
    </div>
  )
}

const EXAMPLES = [
  'A pendulum simulator with a length slider',
  'Drag-and-drop game: sort animals by habitat',
  'A quick 4-option poll',
  'Explore y = mx + c with two sliders',
]
const CHANGES = ['Make it simpler', 'Add a reset button', 'Add a score', 'Make the text bigger']

function HtmlComponent({ nodeKey, initial }: { nodeKey: NodeKey; initial: HtmlData }) {
  const { data, change, rootRef, editing, setEditing } = useBlockData<HtmlData>(
    nodeKey, initial, (n, d) => { if (n instanceof HtmlNode) n.setData(d) },
  )
  const [askOpen, setAskOpen] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [undoCode, setUndoCode] = useState<string | null>(null) // the code before the last AI change
  const [run, setRun] = useState(0)
  const [liveCode, setLiveCode] = useState(data.code) // the widget follows typing a moment later
  const promptRef = useRef<HTMLInputElement>(null)
  const { saveStatus } = useDocument()

  // Editing ends on a click outside (the hook) and when the document is saved: the
  // block then shows just the activity, as a student or a reader will see it.
  useEffect(() => { if (saveStatus === 'saved') setEditing(false) }, [saveStatus, setEditing])
  useEffect(() => { if (!editing) { setAskOpen(false); setCodeOpen(false); setUndoCode(null) } }, [editing])

  useEffect(() => {
    const t = setTimeout(() => setLiveCode(data.code), 350)
    return () => clearTimeout(t)
  }, [data.code])
  useEffect(() => { if (askOpen) promptRef.current?.focus() }, [askOpen])

  const empty = !data.code.trim()

  async function generate(text: string) {
    const ask = text.trim()
    if (!ask || busy) return
    setBusy(true)
    setError(null)
    try {
      const code = await generateHtmlWidget(ask, data.code)
      setUndoCode(data.code)
      // A title is only suggested for a brand-new widget, never for a change request.
      change({ ...data, code, title: data.title || (empty ? ask.slice(0, 60) : '') })
      setPrompt('')
      setCodeOpen(false)
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 503 ? 'The AI is not set up yet (LITELLM_API_KEY on the backend).'
        : err instanceof ApiError && err.status === 422 ? 'The AI could not make a working activity from that. Try describing it differently.'
        : 'Could not reach the AI service. Check that the backend is running.',
      )
    } finally {
      setBusy(false)
    }
  }

  const promptBar = (placeholder: string, chips: string[]) => (
    <div className="html-ask">
      <div className="html-ask-row">
        <input
          ref={promptRef}
          className="html-ask-input"
          value={prompt}
          disabled={busy}
          placeholder={placeholder}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); void generate(prompt) } }}
          aria-label="Describe the activity"
        />
        <button type="button" className="html-go" disabled={busy || !prompt.trim()} onClick={() => void generate(prompt)}>
          {busy ? 'Making…' : 'Generate'}
        </button>
      </div>
      {!busy && (
        <div className="html-chips">
          {chips.map(c => (
            <button key={c} type="button" className="html-chip" onClick={() => void generate(c)}>{c}</button>
          ))}
        </div>
      )}
      {busy && <div className="html-status" role="status"><span className="html-spinner" aria-hidden="true" /> Building it, this takes a few seconds…</div>}
      {error && <div className="html-error" role="alert">{error}</div>}
    </div>
  )

  const codeBox = <HtmlCodeEditor value={data.code} maxLength={MAX_HTML} onChange={code => change({ ...data, code })} />

  // First use: describe it, pick an example, or paste code.
  if (empty && !codeOpen) {
    return (
      <div ref={rootRef} className="html-block html-onboarding" contentEditable={false}>
        <div className="html-onboard-icon" aria-hidden="true">⚡</div>
        <div className="html-onboard-title">Add an interactive activity</div>
        <div className="html-onboard-sub">Describe it and AI builds it: a simulation, a game, a poll. You can change it afterwards.</div>
        {promptBar('e.g. a pendulum simulator with a length slider', EXAMPLES)}
        <button type="button" className="html-link" onClick={() => { setEditing(true); setCodeOpen(true) }}>or paste your own HTML code</button>
      </div>
    )
  }

  // Reading view: only the activity (and its title, if it has one).
  if (!editing) {
    return (
      <div ref={rootRef} className="html-block html-view" contentEditable={false}>
        {data.title && <div className="html-title">{data.title}</div>}
        <SandboxFrame code={data.code} blockId={data.blockId} run={run} />
        <button type="button" className="html-edit-pill" onClick={() => setEditing(true)} aria-label="Edit this activity">✎ Edit</button>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="html-block html-card" contentEditable={false}>
      <div className="html-head">
        <input
          className="html-title-input"
          value={data.title}
          placeholder="Untitled activity"
          onChange={e => change({ ...data, title: e.target.value })}
          onKeyDown={e => e.stopPropagation()}
          aria-label="Activity title"
        />
        <div className="html-actions">
          <button type="button" className={`html-act${askOpen ? ' on' : ''}`} onClick={() => setAskOpen(v => !v)} aria-pressed={askOpen}>✨ Ask AI</button>
          <button type="button" className={`html-act${codeOpen ? ' on' : ''}`} onClick={() => setCodeOpen(v => !v)} aria-pressed={codeOpen}>&lt;/&gt; Code</button>
          <button type="button" className="html-act" onClick={() => setRun(r => r + 1)} title="Start the activity over" aria-label="Restart">↻</button>
          <button type="button" className="html-act html-done" onClick={() => setEditing(false)}>Done</button>
        </div>
      </div>

      <div className={`html-body${busy ? ' html-busy' : ''}`}>
        {empty
          ? <div className="html-empty">The activity appears here as you type</div>
          : <SandboxFrame code={liveCode} blockId={data.blockId} run={run} />}
        {busy && <div className="html-busy-note" aria-hidden="true"><span className="html-spinner" /> Updating…</div>}
      </div>

      {undoCode !== null && !busy && (
        <div className="html-undo">
          Changed by AI.
          <button type="button" className="html-link" onClick={() => { change({ ...data, code: undoCode }); setUndoCode(null) }}>Undo</button>
        </div>
      )}
      {askOpen && promptBar('What should change? e.g. make the buttons bigger', CHANGES)}
      {codeOpen && codeBox}
    </div>
  )
}

export class HtmlNode extends DecoratorNode<React.ReactElement> {
  __code: string
  __title: string
  __blockId: string

  static getType(): string { return 'html' }
  static clone(node: HtmlNode): HtmlNode { return new HtmlNode(node.__code, node.__title, node.__blockId, node.__key) }

  constructor(code = '', title = '', blockId = '', key?: NodeKey) {
    super(key)
    this.__code = code.slice(0, MAX_HTML)
    this.__title = title
    this.__blockId = blockId || newBlockId()
  }

  exportJSON(): SerializedHtmlNode { return { type: 'html', version: 1, code: this.__code, title: this.__title, blockId: this.__blockId } }
  static importJSON(s: SerializedHtmlNode): HtmlNode { return new HtmlNode(s.code ?? '', s.title ?? '', s.blockId) }

  setData(d: HtmlData): void {
    const self = this.getWritable()
    self.__code = d.code.slice(0, MAX_HTML)
    self.__title = d.title
  }

  isInline(): boolean { return false }
  createDOM(_config: EditorConfig): HTMLElement { return document.createElement('div') }
  updateDOM(): boolean { return false }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement {
    return <HtmlComponent nodeKey={this.getKey()} initial={{ code: this.__code, title: this.__title, blockId: this.__blockId }} />
  }
}

export function $createHtmlNode(code?: string, title?: string): HtmlNode { return new HtmlNode(code, title) }
export function $isHtmlNode(node: LexicalNode | null | undefined): node is HtmlNode { return node instanceof HtmlNode }
