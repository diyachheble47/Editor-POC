// The code box of an interactive HTML block. It looks like the editor's own
// Code block (dark body, header bar with the language and Copy, line numbers,
// coloured syntax) but is editable: a transparent <textarea> sits over a
// Prism-coloured copy of the same text, so typing, selection and undo are the
// browser's own.

// The HTML, CSS and JavaScript grammars are registered on Prism by @lexical/code-prism
// (loaded for the Code block), so only the core is imported here.
import Prism from 'prismjs'
import { useMemo, useRef, useState } from 'react'

const LINE_PX = 22.1 // 13px font x 1.7 line height (same as the Code block)
const MIN_LINES = 8
const MAX_LINES = 22
// Past this size colouring costs more than it helps while typing.
const HIGHLIGHT_LIMIT = 30000

export function HtmlCodeEditor({ value, onChange, maxLength }: { value: string; onChange: (v: string) => void; maxLength: number }) {
  const area = useRef<HTMLTextAreaElement>(null)
  const layer = useRef<HTMLPreElement>(null)
  const gutter = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  const lines = Math.max(1, value.split('\n').length)
  const html = useMemo(
    () => (value.length > HIGHLIGHT_LIMIT
      ? value.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))
      : Prism.highlight(value, Prism.languages.markup, 'markup')) + '\n',
    [value],
  )
  const numbers = useMemo(() => Array.from({ length: lines }, (_, i) => i + 1).join('\n'), [lines])

  const sync = () => {
    const a = area.current
    if (!a) return
    if (layer.current) { layer.current.scrollTop = a.scrollTop; layer.current.scrollLeft = a.scrollLeft }
    if (gutter.current) gutter.current.scrollTop = a.scrollTop
  }

  const copy = () => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500) }
    if (navigator.clipboard) navigator.clipboard.writeText(value).then(done).catch(done)
    else done()
  }

  return (
    <div className="hc">
      <div className="hc-head">
        <span className="hc-lang">HTML</span>
        <button type="button" className="hc-btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <div className="hc-body" style={{ height: Math.min(Math.max(lines, MIN_LINES), MAX_LINES) * LINE_PX + 44 }}>
        <pre ref={gutter} className="hc-gutter" aria-hidden="true">{numbers}</pre>
        <pre ref={layer} className="hc-layer" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
        <textarea
          ref={area}
          className="hc-input"
          value={value}
          spellCheck={false}
          wrap="off"
          maxLength={maxLength}
          placeholder="Paste or write HTML, CSS and JavaScript here. The activity updates as you type."
          aria-label="HTML code"
          onScroll={sync}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            e.stopPropagation()
            if (e.key === 'Tab') { // indent instead of leaving the box
              e.preventDefault()
              const t = e.currentTarget
              t.setRangeText('  ', t.selectionStart, t.selectionEnd, 'end')
              onChange(t.value)
            }
          }}
        />
      </div>
      <div className="hc-hint">One file of HTML, CSS and JavaScript. It runs in a locked box: no internet, no access to your document.</div>
    </div>
  )
}
