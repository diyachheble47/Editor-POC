// MermaidNode — a diagram written as Mermaid text (flowchart, sequence, class,
// state, ER, Gantt, pie, mind map…). Reading view is just the drawing,
// resizable from its corners; click it to edit the text with a live preview.
// Click outside to go back.

import { DecoratorNode } from 'lexical'
import type { EditorConfig, LexicalEditor, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useBlockData } from '../_shared/useBlockData'
import { ResizeFrame } from '../_shared/ResizeFrame'
import { useTheme } from '../../../context/ThemeContext'
import { renderMermaid } from './mermaidRender'
import { MERMAID_TEMPLATES } from './templates'

export type SerializedMermaidNode = Spread<{ code: string; width: number }, SerializedLexicalNode>

const MAX_CODE = 20000
const DEFAULT_CODE = MERMAID_TEMPLATES[0].code
const DEFAULT_WIDTH = 480

/** Drawing for `code`; keeps the last good drawing while the text has errors. */
function useDiagram(code: string, active: boolean) {
  const { theme } = useTheme()
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!active) return
    if (!code.trim()) { setSvg(''); setError(null); return }
    let stale = false
    setBusy(true)
    const t = setTimeout(() => {
      renderMermaid(code, theme)
        .then(s => { if (!stale) { setSvg(s); setError(null) } })
        .catch(e => { if (!stale) setError(e instanceof Error ? e.message : String(e)) })
        .finally(() => { if (!stale) setBusy(false) })
    }, 350)
    return () => { stale = true; clearTimeout(t) }
  }, [code, theme, active])

  return { svg, error, busy }
}

/** true once the block is near the viewport (diagrams below the fold wait). */
function useNearViewport() {
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect() } }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [near])
  return { ref, near }
}

/**
 * Shrinks (never crops) the rendered diagram to fit inside a fixed-height box
 * while editing, so the whole diagram stays visible and the box never resizes
 * as you type. `max-height`/`overflow` alone can't do this: a percentage
 * height on an <svg> needs a definite-height ancestor chain, which a flex
 * item doesn't reliably give it, and mermaid's own inline width/height
 * attributes would win over a CSS rule anyway. Reading the diagram's real
 * (viewBox) size and setting pixel width/height directly sidesteps both.
 */
function useFitDiagram(boxRef: React.RefObject<HTMLDivElement | null>, svg: string, active: boolean) {
  useLayoutEffect(() => {
    const box = boxRef.current
    const svgEl = box?.querySelector('svg')
    if (!active || !box || !svgEl) return

    const fit = () => {
      svgEl.style.width = ''
      svgEl.style.height = ''
      const vb = (svgEl as SVGSVGElement).viewBox?.baseVal
      const natural = svgEl.getBoundingClientRect()
      const vbW = vb?.width || natural.width
      const vbH = vb?.height || natural.height
      if (!vbW || !vbH) return
      const pad = 28 // .mm-view's 14px padding, both sides
      const scale = Math.min(1, (box.clientWidth - pad) / vbW, (box.clientHeight - pad) / vbH)
      svgEl.style.width = `${vbW * scale}px`
      svgEl.style.height = `${vbH * scale}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    return () => ro.disconnect()
  }, [boxRef, svg, active])
}

function MermaidComponent({ nodeKey, code, width }: { nodeKey: NodeKey; code: string; width: number }) {
  const { data, change, rootRef, editing, setEditing } = useBlockData<{ code: string; width: number }>(
    nodeKey,
    { code, width },
    (node, d) => { if (node instanceof MermaidNode) { node.setCode(d.code); node.setWidth(d.width) } },
  )
  const { ref: viewRef, near } = useNearViewport()

  // The textarea is deliberately UNCONTROLLED: Lexical re-rendering this
  // component a second time per keystroke (change -> editor.update, slightly
  // after this component's own render for the same keystroke) used to fight
  // a controlled <textarea> for its .value, which resets the browser's own
  // cursor to the end on every commit — even to the same string — and under
  // fast typing the two updates could race and drop characters outright.
  // Typing is read straight off the DOM and kept in local state (liveCode)
  // only to drive the diagram preview and a debounced write to Lexical (the
  // same pattern HtmlNode already uses for its own live preview); the input
  // element's own value is never re-assigned by a render while it's focused,
  // so the browser's native cursor handling is never fought.
  const codeRef = useRef<HTMLTextAreaElement>(null)
  const [liveCode, setLiveCode] = useState(data.code)

  // External changes (template pick, undo/redo, switching away and back)
  // while the box isn't the one being typed into — write them into the DOM.
  useLayoutEffect(() => {
    const el = codeRef.current
    if (el && document.activeElement !== el && el.value !== data.code) el.value = data.code
    setLiveCode(data.code)
  }, [data.code])

  useEffect(() => {
    if (liveCode === data.code) return
    const t = setTimeout(() => change({ code: liveCode, width: data.width }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCode])
  // Flush right away on leaving edit mode (Done / click outside / Save),
  // instead of leaving the last keystroke or two riding on the debounce above.
  useEffect(() => {
    if (editing) return
    if (liveCode !== data.code) change({ code: liveCode, width: data.width })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  const { svg, error, busy } = useDiagram(liveCode, near || editing)
  const boxRef = useRef<HTMLDivElement>(null)
  useFitDiagram(boxRef, svg, editing)

  function pickTemplate(templateCode: string) {
    if (codeRef.current) codeRef.current.value = templateCode
    setLiveCode(templateCode)
    change({ code: templateCode, width: data.width })
  }

  const diagram = svg
    ? <div className="mm-svg" dangerouslySetInnerHTML={{ __html: svg }} />
    : <div className="mm-empty">{busy ? 'Drawing…' : error ? '' : 'Write some Mermaid text to see a diagram'}</div>

  return (
    <div
      className={`mm-block${editing ? ' mm-editing' : ''}`}
      contentEditable={false}
      ref={el => { rootRef.current = el; viewRef.current = el }}
    >
      {/* Fixed height while editing: the drawing can swing from a one-line
          placeholder to a tall diagram on every keystroke, and letting the
          box grow/shrink with it would shove the text box up and down under
          the cursor. The diagram itself is shrunk to fit (useFitDiagram), so
          it always stays fully visible, never cropped. Reading view (not
          editing) is resizable from its corners instead. */}
      {editing ? (
        <div className="mm-view mm-view-fixed" ref={boxRef}>
          {diagram}
          {error && <div className="mm-error" role="alert">{error}</div>}
        </div>
      ) : (
        <ResizeFrame width={data.width} min={240} max={1200} onCommit={w => change({ code: data.code, width: w })}>
          <div className="mm-view" onClick={() => setEditing(true)} title="Click to edit">
            {diagram}
            {error && <div className="mm-error" role="alert">{error}</div>}
          </div>
        </ResizeFrame>
      )}

      {editing && (
        <div className="mm-editor">
          <div className="mm-chips">
            {MERMAID_TEMPLATES.map(t => (
              <button key={t.label} type="button" className="mm-chip" onClick={() => pickTemplate(t.code)}>{t.label}</button>
            ))}
          </div>
          <div className="hc">
            <div className="hc-head"><span className="hc-lang">Mermaid</span>{busy && <span className="hc-lang">drawing…</span>}</div>
            <textarea
              ref={codeRef}
              className="mm-input"
              spellCheck={false}
              autoFocus
              defaultValue={liveCode}
              maxLength={MAX_CODE}
              rows={Math.min(Math.max(liveCode.split('\n').length, 6), 18)}
              onChange={e => setLiveCode(e.target.value)}
              onKeyDown={e => {
                e.stopPropagation()
                if (e.key === 'Tab') { // indent instead of leaving the box
                  e.preventDefault()
                  const t = e.currentTarget
                  t.setRangeText('  ', t.selectionStart, t.selectionEnd, 'end')
                  setLiveCode(t.value)
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export class MermaidNode extends DecoratorNode<React.ReactElement> {
  __code: string
  __width: number

  static getType(): string { return 'mermaid' }
  static clone(node: MermaidNode): MermaidNode { return new MermaidNode(node.__code, node.__width, node.__key) }

  constructor(code = DEFAULT_CODE, width = DEFAULT_WIDTH, key?: NodeKey) {
    super(key)
    this.__code = code
    this.__width = width
  }

  exportJSON(): SerializedMermaidNode { return { type: 'mermaid', version: 1, code: this.__code, width: this.__width } }
  static importJSON(s: SerializedMermaidNode): MermaidNode {
    return new MermaidNode(String(s.code ?? '').slice(0, MAX_CODE), s.width ?? DEFAULT_WIDTH)
  }

  setCode(code: string): void { this.getWritable().__code = code }
  setWidth(width: number): void { this.getWritable().__width = width }

  isInline(): boolean { return false }
  createDOM(_config: EditorConfig): HTMLElement { return document.createElement('div') }
  updateDOM(): boolean { return false }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement {
    return <MermaidComponent nodeKey={this.getKey()} code={this.__code} width={this.__width} />
  }
}

export function $createMermaidNode(code?: string): MermaidNode { return new MermaidNode(code) }
export function $isMermaidNode(node: LexicalNode | null | undefined): node is MermaidNode { return node instanceof MermaidNode }
