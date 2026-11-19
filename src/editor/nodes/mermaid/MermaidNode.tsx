// MermaidNode — a diagram written as Mermaid text (flowchart, sequence, class,
// state, ER, Gantt, pie, mind map…). Reading view is just the drawing; click
// it to edit the text with a live preview. Click outside to go back.

import { DecoratorNode } from 'lexical'
import type { EditorConfig, LexicalEditor, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical'
import { useEffect, useRef, useState } from 'react'
import { useBlockData } from '../_shared/useBlockData'
import { useTheme } from '../../../context/ThemeContext'
import { renderMermaid } from './mermaidRender'
import { MERMAID_TEMPLATES } from './templates'

export type SerializedMermaidNode = Spread<{ code: string }, SerializedLexicalNode>

const MAX_CODE = 20000
const DEFAULT_CODE = MERMAID_TEMPLATES[0].code

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

function MermaidComponent({ nodeKey, code }: { nodeKey: NodeKey; code: string }) {
  const { data, change, rootRef, editing, setEditing } = useBlockData<{ code: string }>(
    nodeKey,
    { code },
    (node, d) => { if (node instanceof MermaidNode) node.setCode(d.code) },
  )
  const { ref: viewRef, near } = useNearViewport()
  const { svg, error, busy } = useDiagram(data.code, near || editing)

  return (
    <div
      className={`mm-block${editing ? ' mm-editing' : ''}`}
      contentEditable={false}
      ref={el => { rootRef.current = el; viewRef.current = el }}
    >
      <div
        className="mm-view"
        onClick={() => setEditing(true)}
        title={editing ? undefined : 'Click to edit'}
      >
        {svg
          ? <div className="mm-svg" dangerouslySetInnerHTML={{ __html: svg }} />
          : <div className="mm-empty">{busy ? 'Drawing…' : error ? '' : 'Write some Mermaid text to see a diagram'}</div>}
        {error && <div className="mm-error" role="alert">{error}</div>}
      </div>

      {editing && (
        <div className="mm-editor">
          <div className="mm-chips">
            {MERMAID_TEMPLATES.map(t => (
              <button key={t.label} type="button" className="mm-chip" onClick={() => change({ code: t.code })}>{t.label}</button>
            ))}
          </div>
          <div className="hc">
            <div className="hc-head"><span className="hc-lang">Mermaid</span>{busy && <span className="hc-lang">drawing…</span>}</div>
            <textarea
              className="mm-input"
              spellCheck={false}
              autoFocus
              value={data.code}
              maxLength={MAX_CODE}
              rows={Math.min(Math.max(data.code.split('\n').length, 6), 18)}
              onChange={e => change({ code: e.target.value })}
              onKeyDown={e => { e.stopPropagation() }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export class MermaidNode extends DecoratorNode<React.ReactElement> {
  __code: string

  static getType(): string { return 'mermaid' }
  static clone(node: MermaidNode): MermaidNode { return new MermaidNode(node.__code, node.__key) }

  constructor(code = DEFAULT_CODE, key?: NodeKey) {
    super(key)
    this.__code = code
  }

  exportJSON(): SerializedMermaidNode { return { type: 'mermaid', version: 1, code: this.__code } }
  static importJSON(s: SerializedMermaidNode): MermaidNode { return new MermaidNode(String(s.code ?? '').slice(0, MAX_CODE)) }

  setCode(code: string): void { this.getWritable().__code = code }

  isInline(): boolean { return false }
  createDOM(_config: EditorConfig): HTMLElement { return document.createElement('div') }
  updateDOM(): boolean { return false }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement {
    return <MermaidComponent nodeKey={this.getKey()} code={this.__code} />
  }
}

export function $createMermaidNode(code?: string): MermaidNode { return new MermaidNode(code) }
export function $isMermaidNode(node: LexicalNode | null | undefined): node is MermaidNode { return node instanceof MermaidNode }
