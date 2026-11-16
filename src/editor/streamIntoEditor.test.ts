import { describe, expect, it } from 'vitest'
import { createEditor, $getRoot } from 'lexical'
import { createDocumentStreamBuilder } from './streamIntoEditor'
import type { StreamEvent } from '../storage/api'

const para = (children: unknown[] = []) => ({
  type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, textFormat: 0, textStyle: '', children,
})
const text = (t: string) => ({ type: 'text', version: 1, text: t, format: 0, detail: 0, mode: 'normal', style: '' })

function run(events: StreamEvent[]) {
  const editor = createEditor({ onError: e => { throw e } })
  const builder = createDocumentStreamBuilder(editor)
  events.forEach(e => builder.apply(e))
  const blocks = editor.getEditorState().read(() => $getRoot().getChildren().map(c => c.getTextContent()))
  return { blocks, skipped: builder.skipped }
}

describe('createDocumentStreamBuilder', () => {
  it('types text pieces into their block, in order', () => {
    const { blocks } = run([
      { t: 'start', blocks: 2, revision: 1 },
      { t: 'open', node: para() }, { t: 'text', child: text('Hel') }, { t: 'text', child: text('lo') }, { t: 'close' },
      { t: 'open', node: para() }, { t: 'text', child: text('Bye') }, { t: 'close' },
      { t: 'done' },
    ])
    expect(blocks).toEqual(['Hello', 'Bye'])
  })

  it('counts a block it cannot create once, and does not misplace its text', () => {
    const { blocks, skipped } = run([
      { t: 'start', blocks: 3, revision: 1 },
      { t: 'open', node: para() }, { t: 'text', child: text('kept') }, { t: 'close' },
      { t: 'open', node: { ...para(), type: 'removed-feature' } },
      { t: 'text', child: text('lost') }, { t: 'text', child: text('lost too') }, { t: 'close' },
      { t: 'block', node: { type: 'also-removed', version: 1 } },
      { t: 'done' },
    ])
    expect(blocks).toEqual(['kept'])
    expect(skipped).toBe(2)
  })

  it('leaves one empty paragraph for an empty document', () => {
    const { blocks } = run([{ t: 'start', blocks: 0, revision: 1 }, { t: 'done' }])
    expect(blocks).toEqual([''])
  })
})
