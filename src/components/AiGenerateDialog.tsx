import { useEffect, useState } from 'react'
import { useDocument } from '../context/DocumentContext'
import { getAiStatus } from '../storage/api'
import type { AiKind } from '../storage/api'

export const KINDS: { value: AiKind; label: string; hint: string }[] = [
  { value: 'lesson', label: 'Lesson builder', hint: 'The lesson itself: sections with diagrams, tables, worked examples, key points, check questions.' },
  { value: 'lesson_plan', label: 'Lesson plan', hint: 'For the teacher: timed stage table, objectives, activities, rubric, differentiation, homework.' },
  { value: 'workbook', label: 'Workbook', hint: 'For students: recap, many question types with tables and diagrams, and an answer key.' },
]

export function AiGenerateDialog({ onClose }: { onClose: () => void }) {
  const { startAiDocument } = useDocument()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<AiKind>('lesson')
  const [configured, setConfigured] = useState<boolean | null>(null)

  useEffect(() => { void getAiStatus().then(setConfigured) }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    startAiDocument({ title: title.trim(), description: description.trim(), kind })
    onClose()
  }

  return (
    <div className="ai-dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <form className="ai-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Create with AI">
        <h2 className="ai-dialog-title">Create with AI</h2>
        <p className="ai-dialog-sub">Generates a new document. Check the content before using it — AI can make mistakes.</p>

        <label className="ai-dialog-field">
          <span>Title</span>
          <input
            autoFocus
            value={title}
            maxLength={120}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Acids, bases and salts"
          />
        </label>

        <label className="ai-dialog-field">
          <span>Description <em>(optional)</em></span>
          <textarea
            value={description}
            maxLength={2000}
            rows={4}
            onChange={e => setDescription(e.target.value)}
            placeholder="Class, level, what to cover, anything to include or avoid…"
          />
        </label>

        <fieldset className="ai-dialog-kinds">
          <legend>Type</legend>
          {KINDS.map(k => (
            <label key={k.value} className={`ai-dialog-kind${kind === k.value ? ' selected' : ''}`}>
              <input type="radio" name="kind" checked={kind === k.value} onChange={() => setKind(k.value)} />
              <span className="ai-dialog-kind-label">{k.label}</span>
              <span className="ai-dialog-kind-hint">{k.hint}</span>
            </label>
          ))}
        </fieldset>

        {configured === false && (
          <p className="ai-dialog-warn" role="alert">
            The AI isn&apos;t set up yet. Add the Gemini key to the backend&apos;s env file and restart the backend
            (see backend/.env.example).
          </p>
        )}

        <div className="ai-dialog-actions">
          <button type="button" className="ai-dialog-cancel" onClick={onClose}>Cancel</button>
          <button type="submit" className="ai-dialog-submit" disabled={!title.trim() || configured === false}>
            Generate
          </button>
        </div>
      </form>
    </div>
  )
}
