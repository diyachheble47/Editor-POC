// The actual "Chemical Equation Editor" UI: a toolbar, a live preview,
// a plain-text input, a validation line, and a Balance Equation action.
//
// This file only handles editing UI/state (toolbar, undo/redo, debounced
// validation). All chemistry logic — parsing, validating, balancing — is
// imported from ../chemistry/*, and turning text into pretty typeset math
// is imported from ../chemistry/toKatex + KaTeX. None of that logic lives
// in this component; it just wires user input to those pure functions.

import { useEffect, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/contrib/mhchem'
import 'katex/dist/katex.min.css'
import { toKatexSource } from './chemistry/toKatex'
import { validateEquation } from './chemistry/validate'
import { balanceEquation } from './chemistry/balance'
import { formatEquation } from './chemistry/format'
import type { ValidationStatus } from './chemistry/validate'

const TYPE_LABELS: Record<string, string> = {
  formula: 'Formula',
  ion: 'Ion',
  reaction: 'Reaction',
  equilibrium: 'Equilibrium Reaction',
}

const STATUS_TONE: Record<ValidationStatus, 'neutral' | 'good' | 'warn' | 'bad'> = {
  empty: 'neutral',
  incomplete: 'warn',
  'invalid-element': 'bad',
  unbalanced: 'warn',
  balanced: 'good',
  'valid-formula': 'good',
  'valid-ion': 'good',
}

function renderPreviewHtml(source: string): string {
  return katex.renderToString(toKatexSource(source), { throwOnError: false, output: 'html' })
}

export function EquationEditorPanel({
  initialValue,
  onSave,
  onCancel,
}: {
  initialValue: string
  onSave: (value: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initialValue)
  const [past, setPast] = useState<string[]>([])
  const [future, setFuture] = useState<string[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [validation, setValidation] = useState(() => validateEquation(initialValue))
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounced validation: wait until the user pauses typing for a moment
  // before showing a validation message, so it doesn't complain about
  // every half-finished keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setValidation(validateEquation(draft)), 500)
    return () => clearTimeout(timer)
  }, [draft])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  function commitChange(newValue: string) {
    setPast((prev) => [...prev.slice(-99), draft])
    setFuture([])
    setDraft(newValue)
  }

  function undo() {
    if (past.length === 0) return
    const previous = past[past.length - 1]
    setPast((prev) => prev.slice(0, -1))
    setFuture((prev) => [draft, ...prev])
    setDraft(previous)
  }

  function redo() {
    if (future.length === 0) return
    const next = future[0]
    setFuture((prev) => prev.slice(1))
    setPast((prev) => [...prev, draft])
    setDraft(next)
  }

  function insertAtCursor(snippet: string, cursorBackBy = 0) {
    const input = inputRef.current
    const start = input?.selectionStart ?? draft.length
    const end = input?.selectionEnd ?? draft.length
    const newValue = draft.slice(0, start) + snippet + draft.slice(end)
    commitChange(newValue)

    requestAnimationFrame(() => {
      if (!input) return
      input.focus()
      const pos = start + snippet.length - cursorBackBy
      input.setSelectionRange(pos, pos)
    })
  }

  function handleBalance() {
    if (!validation.parsed) return
    const result = balanceEquation(validation.parsed)
    if (!result) {
      setToast('Could not automatically balance this equation.')
      return
    }
    const balancedText = formatEquation({
      ...validation.parsed,
      reactants: result.reactants,
      products: result.products,
    })
    commitChange(balancedText)
    setToast('Equation balanced successfully.')
  }

  const isReaction = validation.parsed?.type === 'reaction' || validation.parsed?.type === 'equilibrium'
  const typeLabel = validation.parsed ? TYPE_LABELS[validation.parsed.type] : null
  const tone = STATUS_TONE[validation.status]

  return (
    <div className="equation-editor-panel">
      <div className="eq-toolbar">
        <button type="button" onClick={() => insertAtCursor('_{}', 1)} title="Subscript">
          X<sub>2</sub>
        </button>
        <button type="button" onClick={() => insertAtCursor('^{}', 1)} title="Superscript">
          X<sup>2</sup>
        </button>
        <button type="button" onClick={() => insertAtCursor('^+')} title="Charge">
          Charge
        </button>
        <button type="button" onClick={() => insertAtCursor(' -> ')} title="Reaction arrow">
          →
        </button>
        <button type="button" onClick={() => insertAtCursor(' <=> ')} title="Equilibrium arrow">
          ⇌
        </button>
        <button type="button" onClick={() => insertAtCursor(' + ')} title="Plus">
          +
        </button>
        <button type="button" onClick={() => insertAtCursor('()', 1)} title="Parentheses">
          ( )
        </button>
        <span className="eq-toolbar-divider" />
        {(['s', 'l', 'g', 'aq'] as const).map((state) => (
          <button key={state} type="button" onClick={() => insertAtCursor(`(${state})`)} title={`State: ${state}`}>
            ({state})
          </button>
        ))}
        <button type="button" onClick={() => insertAtCursor('[\\Delta]')} title="Heat / condition over arrow">
          Δ
        </button>
        <span className="eq-toolbar-divider" />
        <button type="button" onClick={undo} disabled={past.length === 0} title="Undo">
          ↶
        </button>
        <button type="button" onClick={redo} disabled={future.length === 0} title="Redo">
          ↷
        </button>
        <button type="button" onClick={() => commitChange('')} title="Clear">
          Clear
        </button>
      </div>

      <div
        className="equation-preview"
        dangerouslySetInnerHTML={{ __html: renderPreviewHtml(draft) }}
      />

      <input
        ref={inputRef}
        className="equation-input"
        value={draft}
        autoFocus
        placeholder="H2 + O2 -> H2O"
        onChange={(e) => commitChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(draft)
        }}
      />

      <div className="eq-status-row">
        {typeLabel && <span className="eq-type-badge">{typeLabel}</span>}
        {validation.message && (
          <span className={`eq-validation-message tone-${tone}`}>{validation.message}</span>
        )}
      </div>

      {toast && <div className="eq-toast">{toast}</div>}

      <div className="eq-actions">
        {isReaction && (
          <button type="button" className="eq-balance-button" onClick={handleBalance}>
            Balance Equation
          </button>
        )}
        <div className="eq-actions-spacer" />
        <button
          type="button"
          className="eq-cancel-button"
          onClick={() => onCancel()}
        >
          Cancel
        </button>
        <button type="button" className="eq-done-button" onClick={() => onSave(draft)}>
          Done
        </button>
      </div>
    </div>
  )
}
