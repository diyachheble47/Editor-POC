import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MutableRefObject, ReactNode } from 'react'

export type FlyoutKind = 'workbook' | 'lesson' | 'lesson_plan'
type RowId = 'workbook' | 'lesson' | 'lesson_plan'

// Each row reads as a sentence with a blank to fill in: "Create a Workbook for ______".
const ROWS: { id: RowId; kind: FlyoutKind; label: ReactNode; aria: string; placeholder: string }[] = [
  { id: 'workbook', kind: 'workbook', label: <>Create a <strong>Workbook</strong> for</>, aria: 'Create a Workbook for', placeholder: 'topic, class…' },
  { id: 'lesson', kind: 'lesson', label: <>Create a <strong>Lesson Builder</strong> for</>, aria: 'Create a Lesson Builder for', placeholder: 'topic, class…' },
  { id: 'lesson_plan', kind: 'lesson_plan', label: <>Create a <strong>Lesson Plan</strong> for</>, aria: 'Create a Lesson Plan for', placeholder: 'topic, duration…' },
]

// What "Generate" can produce — one block, exactly this type. `value` is the
// AiBlock `type` string (matches src/storage/api.ts's AiBlock union and
// backend/app/ai_blocks.py's sanitize_block dispatch 1:1), not a display label.
const GENERATE_TYPES: { value: string; label: string }[] = [
  { value: 'graph', label: 'Graph' },
  { value: 'geometry', label: 'Geometry' },
  { value: 'molecule', label: 'Molecule' },
  { value: 'circuit', label: 'Circuit' },
  { value: 'matrix', label: 'Matrix' },
  { value: 'flowchart', label: 'Flowchart' },
  { value: 'chart', label: 'Chart' },
  { value: 'equation', label: 'Equation' },
]

const WIDTH = 440

/**
 * The submenu that opens beside the slash menu's "Agent" and "Generate"
 * items.
 *
 * "Agent" shows the three fill-in-the-blank sentence rows below, each
 * running the full AI Agent panel (`onRun`) — a whole-document generation
 * pass with its own preview/Accept step. "Generate" (`rows={['generate']}`)
 * shows a single different row instead: a block-type dropdown + a topic
 * blank, which does NOT go through that panel at all — `onGenerate` inserts
 * just that one block directly where the cursor was, immediately, no
 * document rewrite and no preview step. See src/editor/ai/generateBlock.ts
 * for why these two need genuinely different plumbing, not just a kind flag.
 */
export function AgentFlyout({
  rows, onRun, onGenerate, onBack, focusRef,
}: {
  /** Which rows to show, and in what order. Defaults to all three "Agent" rows. */
  rows?: (RowId | 'generate')[]
  onRun: (kind: FlyoutKind, prompt: string) => void
  onGenerate: (blockLabel: string, topic: string) => void
  onBack: () => void
  focusRef: MutableRefObject<(() => void) | null>
}) {
  const showGenerate = (rows ?? []).includes('generate')
  const shown = showGenerate ? [] : ROWS.filter(r => (rows ?? ['workbook', 'lesson', 'lesson_plan']).includes(r.id))
  const [values, setValues] = useState<Record<RowId, string>>({ workbook: '', lesson: '', lesson_plan: '' })
  const [genType, setGenType] = useState(GENERATE_TYPES[0].value)
  const [genTopic, setGenTopic] = useState('')
  const [flip, setFlip] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const genTopicRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    focusRef.current = () => (showGenerate ? genTopicRef.current : inputs.current[0])?.focus()
    return () => { focusRef.current = null }
  }, [focusRef, showGenerate])

  // Open to the left instead when there is no room on the right of the slash menu.
  useLayoutEffect(() => {
    const parent = rootRef.current?.parentElement
    if (!parent) return
    const r = parent.getBoundingClientRect()
    setFlip(r.right + 6 + WIDTH > window.innerWidth && r.left - 6 - WIDTH > 0)
  }, [])

  function runGenerate() {
    const topic = genTopic.trim()
    if (!topic) return
    const label = GENERATE_TYPES.find(t => t.value === genType)?.label ?? genType
    onGenerate(label, topic)
  }

  return (
    <div ref={rootRef} className={`agent-flyout${flip ? ' flip' : ''}`} style={{ width: WIDTH }} role="group" aria-label="AI Agent">
      <div className="agent-flyout-head">{showGenerate ? 'Generate a block with AI' : 'Create with AI'}</div>

      {showGenerate && (
        <label className="agent-flyout-row agent-flyout-generate">
          <select
            className="agent-flyout-select"
            value={genType}
            onChange={e => setGenType(e.target.value)}
            aria-label="Block type to generate"
          >
            {GENERATE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input
            ref={genTopicRef}
            className="agent-flyout-blank"
            value={genTopic}
            maxLength={2000}
            placeholder="Electric Circuits"
            onChange={e => setGenTopic(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); runGenerate() }
              else if (e.key === 'Escape' || (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0)) {
                e.preventDefault(); onBack()
              }
            }}
            aria-label="Topic"
          />
          {genTopic.trim() && (
            <button type="button" className="agent-flyout-run" onClick={runGenerate}>
              Run <span className="agent-run-enter" aria-hidden="true">↵</span>
            </button>
          )}
        </label>
      )}

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
