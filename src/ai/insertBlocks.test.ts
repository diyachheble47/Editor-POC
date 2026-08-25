import { describe, test, expect } from 'vitest'
import { createEditor, $getRoot } from 'lexical'
import type { LexicalEditor } from 'lexical'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ListNode, ListItemNode } from '@lexical/list'
import { insertBlocks } from './insertBlocks'
import type { AIBlock } from './types'

function makeEditor(): LexicalEditor {
  return createEditor({
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode],
    onError: (e) => { throw e },
  })
}

function update(editor: LexicalEditor, fn: () => void) {
  editor.update(fn, { discrete: true })
}

describe('insertBlocks', () => {
  test('inserts paragraph block', () => {
    const editor = makeEditor()
    const blocks: AIBlock[] = [{ type: 'paragraph', text: 'Hello world' }]

    insertBlocks(editor, blocks)

    editor.read(() => {
      const root = $getRoot()
      expect(root.getChildrenSize()).toBeGreaterThan(0)
      const last = root.getLastChild()
      expect(last?.getTextContent()).toBe('Hello world')
    })
  })

  test('inserts heading block', () => {
    const editor = makeEditor()
    const blocks: AIBlock[] = [{ type: 'heading', level: 2, text: 'My Heading' }]

    insertBlocks(editor, blocks)

    editor.read(() => {
      const root = $getRoot()
      const last = root.getLastChild()
      expect(last?.getTextContent()).toBe('My Heading')
    })
  })

  test('inserts bullet-list block', () => {
    const editor = makeEditor()
    const blocks: AIBlock[] = [
      { type: 'bullet-list', items: ['First', 'Second', 'Third'] },
    ]

    insertBlocks(editor, blocks)

    editor.read(() => {
      const root = $getRoot()
      const list = root.getLastChild()
      expect(list?.getTextContent()).toContain('First')
      expect(list?.getTextContent()).toContain('Second')
    })
  })

  test('inserts multiple blocks in order', () => {
    const editor = makeEditor()
    const blocks: AIBlock[] = [
      { type: 'paragraph', text: 'Block A' },
      { type: 'paragraph', text: 'Block B' },
      { type: 'paragraph', text: 'Block C' },
    ]

    insertBlocks(editor, blocks)

    editor.read(() => {
      const children = $getRoot().getChildren()
      const texts = children.map(c => c.getTextContent())
      expect(texts).toContain('Block A')
      expect(texts).toContain('Block B')
      expect(texts).toContain('Block C')
    })
  })

  test('does nothing for empty block array', () => {
    const editor = makeEditor()
    update(editor, () => {})
    const sizeBefore = editor.getEditorState().read(() => $getRoot().getChildrenSize())

    insertBlocks(editor, [])

    const sizeAfter = editor.getEditorState().read(() => $getRoot().getChildrenSize())
    expect(sizeAfter).toBe(sizeBefore)
  })

  test('inserts heading with correct level h1', () => {
    const editor = makeEditor()
    const blocks: AIBlock[] = [{ type: 'heading', level: 1, text: 'H1 Title' }]

    insertBlocks(editor, blocks)

    editor.read(() => {
      const root = $getRoot()
      const last = root.getLastChild()
      expect(last?.getTextContent()).toBe('H1 Title')
    })
  })
})
