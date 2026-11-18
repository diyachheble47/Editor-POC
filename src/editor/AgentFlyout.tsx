import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'

export type FlyoutKind = 'workbook' | 'lesson' | 'lesson_plan'

// Each row reads as a sentence with a blank to fill in: "Create a Workbook for ______".
const ROWS: { kind: FlyoutKind; lead: string; name: string; placeholder: string }[] = [
  { kind: 'workbook', lead: 'Create a', name: 'Workbook', placeholder: 'topic, class…' },
  { kind: 'lesson', lead: 'Create a', name: 'Lesson Builder', placeholder: 'topic, class…' },
  { kind: 'lesson_plan', lead: 'Create a', name: 'Lesson Plan', placeholder: 'topic, duration…' },
]

const WIDTH = 440

/**
 * The submenu that opens beside the slash menu's "AI Agent" item. Three
 * fill-in-the-blank sentences; the Run button and ↵ hint appear only on the
 * row being typed in. Arrow Up/Down moves between rows, Enter runs, and
 * Escape (or Left at the start of a blank) goes back to the slash menu.
 */
export function AgentFlyout({
  onRun,
  onBack,
  focusRef,
}: {
  onRun: (kind: FlyoutKind, prompt: string) => void
  onBack: () => void
  focusRef: MutableRefObject<(() => void) | null>
}) {
  const [values, setValues] = useState<Record<FlyoutKind, string>>({ workbook: '', lesson: '', lesson_plan: '' })
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
      <div className="agent-flyout-head">Create with AI</div>
      {ROWS.map((row, i) => {
        const value = values[row.kind]
        const typed = value.trim().length > 0
        return (
          <label key={row.kind} className="agent-flyout-row">
            <span className="agent-flyout-lead">{row.lead} <strong>{row.name}</strong> for</span>
            <input
              ref={el => { inputs.current[i] = el }}
              className="agent-flyout-blank"
              value={value}
              maxLength={2000}
              placeholder={row.placeholder}
              onChange={e => setValues(v => ({ ...v, [row.kind]: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); if (typed) onRun(row.kind, value.trim()) }
                else if (e.key === 'ArrowDown') { e.preventDefault(); inputs.current[(i + 1) % ROWS.length]?.focus() }
                else if (e.key === 'ArrowUp') { e.preventDefault(); inputs.current[(i + ROWS.length - 1) % ROWS.length]?.focus() }
                else if (e.key === 'Escape' || (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0)) {
                  e.preventDefault(); onBack()
                }
              }}
              aria-label={`${row.lead} ${row.name} for`}
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
