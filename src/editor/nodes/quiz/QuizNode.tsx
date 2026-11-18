// QuizNode — multiple-choice questions that answer back: pick an option and it
// turns green or red with a one-line explanation. Answers picked while viewing
// are not saved. The ✎ button edits questions, options and the right answer.

import { DecoratorNode } from 'lexical'
import type { EditorConfig, LexicalEditor, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical'
import { useState } from 'react'
import { useBlockData } from '../_shared/useBlockData'

export type QuizQuestion = { q: string; options: string[]; answer: number; why: string }
export type QuizData = { questions: QuizQuestion[] }
export type SerializedQuizNode = Spread<QuizData, SerializedLexicalNode>

const MAX_Q = 10
const MAX_OPTS = 6
export const DEFAULT_QUIZ: QuizQuestion[] = [
  { q: 'Your question here?', options: ['Option A', 'Option B', 'Option C'], answer: 0, why: 'Why this answer is right.' },
]

function QuizComponent({ nodeKey, initial }: { nodeKey: NodeKey; initial: QuizData }) {
  const { data, change, editing, setEditing, rootRef } = useBlockData<QuizData>(
    nodeKey, initial, (n, d) => { if (n instanceof QuizNode) n.setQuestions(d.questions) },
  )
  const [picked, setPicked] = useState<Record<number, number>>({})
  const qs = data.questions

  const setQ = (i: number, patch: Partial<QuizQuestion>) => change({ questions: qs.map((q, k) => (k === i ? { ...q, ...patch } : q)) })
  const setOpt = (i: number, j: number, v: string) => setQ(i, { options: qs[i].options.map((o, k) => (k === j ? v : o)) })

  return (
    <div ref={rootRef} className={`rb-block quiz-block${editing ? ' rb-editing' : ''}`} contentEditable={false}>
      <button type="button" className="rb-edit" onClick={() => setEditing(!editing)} title={editing ? 'Done' : 'Edit quiz'} aria-label={editing ? 'Done editing' : 'Edit quiz'}>
        {editing ? 'Done' : '✎'}
      </button>

      {editing ? (
        <div className="rb-form">
          {qs.map((q, i) => (
            <div key={i} className="quiz-edit-q">
              <div className="rb-form-row">
                <input className="rb-input" value={q.q} placeholder={`Question ${i + 1}`} onChange={e => setQ(i, { q: e.target.value })} onKeyDown={e => e.stopPropagation()} aria-label="Question" />
                {qs.length > 1 && <button type="button" className="rt-x" onClick={() => change({ questions: qs.filter((_, k) => k !== i) })} title="Remove question">×</button>}
              </div>
              {q.options.map((o, j) => (
                <div key={j} className="rb-form-row">
                  <input type="radio" name={`${nodeKey}-${i}`} checked={q.answer === j} onChange={() => setQ(i, { answer: j })} aria-label="Correct answer" title="Mark as the correct answer" />
                  <input className="rb-input" value={o} placeholder={`Option ${j + 1}`} onChange={e => setOpt(i, j, e.target.value)} onKeyDown={e => e.stopPropagation()} aria-label="Option" />
                  {q.options.length > 2 && (
                    <button type="button" className="rt-x" title="Remove option" onClick={() => setQ(i, { options: q.options.filter((_, k) => k !== j), answer: q.answer === j ? 0 : q.answer > j ? q.answer - 1 : q.answer })}>×</button>
                  )}
                </div>
              ))}
              {q.options.length < MAX_OPTS && <button type="button" className="rt-btn" onClick={() => setQ(i, { options: [...q.options, ''] })}>+ Option</button>}
              <input className="rb-input" value={q.why} placeholder="Explanation shown after answering" onChange={e => setQ(i, { why: e.target.value })} onKeyDown={e => e.stopPropagation()} aria-label="Explanation" />
            </div>
          ))}
          {qs.length < MAX_Q && <button type="button" className="rt-btn" onClick={() => change({ questions: [...qs, { q: '', options: ['', ''], answer: 0, why: '' }] })}>+ Question</button>}
        </div>
      ) : (
        <>
          {qs.map((q, i) => {
            const choice = picked[i]
            const done = choice !== undefined
            return (
              <div key={i} className="quiz-q">
                <div className="quiz-q-text">{i + 1}. {q.q}</div>
                <div className="quiz-opts">
                  {q.options.map((o, j) => {
                    const cls = done ? (j === q.answer ? ' correct' : j === choice ? ' wrong' : '') : ''
                    return (
                      <button key={j} type="button" className={`quiz-opt${cls}`} disabled={done} onClick={() => setPicked(p => ({ ...p, [i]: j }))}>
                        {o}
                      </button>
                    )
                  })}
                </div>
                <div className="quiz-feedback" aria-live="polite">
                  {done && `${choice === q.answer ? 'Correct.' : 'Not quite.'} ${q.why}`}
                </div>
              </div>
            )
          })}
          {Object.keys(picked).length > 0 && (
            <button type="button" className="rt-btn" onClick={() => setPicked({})}>Try again</button>
          )}
        </>
      )}
    </div>
  )
}

export class QuizNode extends DecoratorNode<React.ReactElement> {
  __questions: QuizQuestion[]

  static getType(): string { return 'quiz' }
  static clone(node: QuizNode): QuizNode { return new QuizNode(node.__questions, node.__key) }

  constructor(questions: QuizQuestion[] = DEFAULT_QUIZ, key?: NodeKey) {
    super(key)
    this.__questions = questions.length ? questions : DEFAULT_QUIZ
  }

  exportJSON(): SerializedQuizNode { return { type: 'quiz', version: 1, questions: this.__questions } }
  static importJSON(s: SerializedQuizNode): QuizNode { return new QuizNode(s.questions ?? DEFAULT_QUIZ) }

  setQuestions(questions: QuizQuestion[]): void { this.getWritable().__questions = questions.length ? questions : DEFAULT_QUIZ }

  isInline(): boolean { return false }
  createDOM(_config: EditorConfig): HTMLElement { return document.createElement('div') }
  updateDOM(): boolean { return false }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement {
    return <QuizComponent nodeKey={this.getKey()} initial={{ questions: this.__questions }} />
  }
}

export function $createQuizNode(questions?: QuizQuestion[]): QuizNode { return new QuizNode(questions) }
export function $isQuizNode(node: LexicalNode | null | undefined): node is QuizNode { return node instanceof QuizNode }
