import { describe, test, expect } from 'vitest'
import { createEditor, $getRoot, $createParagraphNode, $createTextNode } from 'lexical'
import { HeadingNode, $createHeadingNode } from '@lexical/rich-text'
import { CalloutNode, $createCalloutNode } from '../nodes/callout/CalloutNode'
import { SectionNode, $createSectionNode } from '../nodes/section/SectionNode'
import { DataTableNode } from '../nodes/datatable/DataTableNode'
import { buildEditContext, isDocEmpty } from './editContext'

function makeEditor() {
  return createEditor({ nodes: [HeadingNode, CalloutNode, SectionNode, DataTableNode], onError: e => { throw e } })
}

describe('editContext', () => {
  test('an empty document is empty, and has nothing to send', () => {
    const editor = makeEditor()
    editor.update(() => { $getRoot().append($createParagraphNode()) }, { discrete: true })
    expect(isDocEmpty(editor)).toBe(true)
    expect(buildEditContext(editor).text).toBe('')
  })

  test('blocks are numbered; empty paragraphs are skipped; originals line up with the numbers', () => {
    const editor = makeEditor()
    editor.update(() => {
      $getRoot().append(
        $createHeadingNode('h1').append($createTextNode('Acids')),
        $createParagraphNode(),
        $createParagraphNode().append($createTextNode('Acids taste sour.')),
        $createCalloutNode('tip', 'Never taste them.'),
      )
    }, { discrete: true })
    const ctx = buildEditContext(editor)
    expect(isDocEmpty(editor)).toBe(false)
    expect(ctx.text.split('\n')).toEqual([
      '#0 heading(1): Acids',
      '#1 paragraph: Acids taste sour.',
      '#2 callout(tip): Never taste them.',
    ])
    expect(ctx.originals.map(o => o.type)).toEqual(['heading', 'paragraph', 'callout'])
    expect(ctx.tooLong).toBe(false)
  })

  test('a very long document is flagged instead of being cut off', () => {
    const editor = makeEditor()
    editor.update(() => {
      for (let i = 0; i < 40; i++) $getRoot().append($createParagraphNode().append($createTextNode('x'.repeat(1000))))
    }, { discrete: true })
    expect(buildEditContext(editor).tooLong).toBe(true)
  })

  test('with keys, only those blocks are sent and numbered from 0', () => {
    const editor = makeEditor()
    let keys: string[] = []
    editor.update(() => {
      const a = $createParagraphNode().append($createTextNode('one'))
      const b = $createParagraphNode().append($createTextNode('two'))
      const c = $createParagraphNode().append($createTextNode('three'))
      $getRoot().append(a, b, c)
      keys = [b.getKey(), c.getKey()]
    }, { discrete: true })
    const ctx = buildEditContext(editor, keys)
    expect(ctx.text).toBe('#0 paragraph: two\n#1 paragraph: three')
    expect(ctx.originals).toHaveLength(2)
  })

  test('sections and styled tables are described as editable text, not kept blobs', () => {
    const editor = makeEditor()
    editor.update(() => {
      $getRoot().append(
        $createSectionNode().append($createTextNode('1. Intro')),
        new DataTableNode([['Name', 'Value'], ['a', '1']]),
      )
    }, { discrete: true })
    expect(buildEditContext(editor).text.split('\n')).toEqual(['#0 section: 1. Intro', '#1 table: Name | Value // a | 1'])
  })
})
