import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MutableRefObject, ReactNode } from 'react'

export type FlyoutKind = 'workbook' | 'lesson' | 'lesson_plan'
type RowId = 'workbook' | 'lesson' | 'lesson_plan' | 'generate'

// Each row reads as a sentence with a blank to fill in: "Create a Workbook for ______".
// `id` is the row's own identity (keeps its typed value separate even when two
// rows share an underlying AiKind, as 'lesson' and 'generate' do below); `kind`
// is what actually gets sent to the AI.
const ROWS: { id: RowId; kind: FlyoutKind; label: ReactNode; aria: string; placeholder: string }[] = [
  { id: 'workbook', kind: 'workbook', label: <>Create a <strong>Workbook</strong> for</>, aria: 'Create a Workbook for', placeholder: 'topic, class…' },
  { id: 'lesson', kind: 'lesson', label: <>Create a <strong>Lesson Builder</strong> for</>, aria: 'Create a Lesson Builder for', placeholder: 'topic, class…' },
  { id: 'lesson_plan', kind: 'lesson_plan', label: <>Create a <strong>Lesson Plan</strong> for</>, aria: 'Create a Lesson Plan for', placeholder: 'topic, duration…' },
  // No kind of its own on the backend — "Generate" is a quick, no-settings way
  // into the same free-topic content generation "Lesson Builder" already does.
  { id: 'generate', kind: 'lesson', label: <strong>Generate</strong>, aria: 'Generate', placeholder: 'Electric Circuits' },
]

const WIDTH = 440

/**
 * The submenu that opens beside the slash menu's "Agent" and "Generate"
 * items. Fill-in-the-blank sentences (one for "Generate"); the Run button
 * and ↵ hint appear only on the row being typed in. Arrow Up/Down moves
 * between rows, Enter runs, and Escape (or Left at the start of a blank)
 * goes back to the slash menu.
 */
export function AgentFlyout({
  rows, onRun, onBack, focusRef,
}: {
  /** Which rows to show, and in what order. Defaults to all three "Agent" rows. */
  rows?: RowId[]
  onRun: (kind: FlyoutKind, prompt: string) => void
  onBack: () => void
  focusRef: MutableRefObject<(() => void) | null>
}) {
  const shown = ROWS.filter(r => (rows ?? ['workbook', 'lesson', 'lesson_plan']).includes(r.id))
  const [values, setValues] = useState<Record<RowId, string>>({ workbook: '', lesson: '', lesson_plan: '', generate: '' })
  const [flip, setFlip] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    focusRef.current = () => inputs.current[0]?.focus()
    return () => { focusRef.current = null }
  }, [focusRef])

  // Open to the left instead when there is no room on the right of the slash menu.
  useLayoutEffect(() => {
    const parent = rootRef.current?.parentElement
    if (!parent) return
    const r = parent.getBoundingClientRect()
    setFlip(r.right + 6 + WIDTH > window.innerWidth && r.left - 6 - WIDTH > 0)
  }, [])

  return (
    <div ref={rootRef} className={`agent-flyout${flip ? ' flip' : ''}`} style={{ width: WIDTH }} role="group" aria-label="AI Agent">
      <div className="agent-flyout-head">{shown.length === 1 && shown[0].id === 'generate' ? 'Generate with AI' : 'Create with AI'}</div>
      {shown.map((row, i) => {
        const value = values[row.id]
        const typed = value.trim().length > 0
        return (
          <label key={row.id} className="agent-flyout-row">
            <span className="agent-flyout-lead">{row.label}</span>
            <input
              ref={el => { inputs.current[i] = el }}
              className="agent-flyout-blank"
              value={value}
              maxLength={2000}
              placeholder={row.placeholder}
              onChange={e => setValues(v => ({ ...v, [row.id]: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); if (typed) onRun(row.kind, value.trim()) }
                else if (e.key === 'ArrowDown') { e.preventDefault(); inputs.current[(i + 1) % shown.length]?.focus() }
                else if (e.key === 'ArrowUp') { e.preventDefault(); inputs.current[(i + shown.length - 1) % shown.length]?.focus() }
                else if (e.key === 'Escape' || (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0)) {
                  e.preventDefault(); onBack()
                }
              }}
              aria-label={row.aria}
            />
            {typed && (
              <button type="button" className="agent-flyout-run" onClick={() => onRun(row.kind, value.trim())}>
                Run <span className="agent-run-enter" aria-hidden="true">↵</span>
              </button>
            )}
          </label>
        )
      })}
    </div>
  )
}
