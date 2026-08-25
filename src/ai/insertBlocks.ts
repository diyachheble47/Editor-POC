import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
} from 'lexical'
import type { LexicalEditor } from 'lexical'
import { $createHeadingNode } from '@lexical/rich-text'
import { $createListNode, $createListItemNode } from '@lexical/list'
import { $createCodeNode } from '@lexical/code-core'
import { $createCalloutNode } from '../editor/nodes/callout/CalloutNode'
import { $createMathNode } from '../editor/nodes/math/MathNode'
import type { AIBlock } from './types'

export interface SavedRange {
  anchorKey: string
  anchorOffset: number
  anchorType: 'text' | 'element'
  focusKey: string
  focusOffset: number
  focusType: 'text' | 'element'
}

export function captureRange(editor: LexicalEditor): SavedRange | null {
  return editor.getEditorState().read(() => {
    const sel = $getSelection()
    if (!$isRangeSelection(sel) || sel.isCollapsed()) return null
    return {
      anchorKey: sel.anchor.key,
      anchorOffset: sel.anchor.offset,
      anchorType: sel.anchor.type,
      focusKey: sel.focus.key,
      focusOffset: sel.focus.offset,
      focusType: sel.focus.type,
    }
  })
}

export function replaceSelectionWithBlocks(
  editor: LexicalEditor,
  saved: SavedRange,
  blocks: AIBlock[],
): void {
  if (blocks.length === 0) return

  editor.update(() => {
    const sel = $createRangeSelection()
    sel.anchor.set(saved.anchorKey, saved.anchorOffset, saved.anchorType)
    sel.focus.set(saved.focusKey, saved.focusOffset, saved.focusType)
    $setSelection(sel)
    sel.removeText()

    const refreshed = $getSelection()
    const insertionParent = $isRangeSelection(refreshed)
      ? refreshed.anchor.getNode().getTopLevelElementOrThrow()
      : $getRoot().getLastChild()

    let insertAfter = insertionParent
    for (const block of blocks) {
      const node = buildLexicalNode(block)
      if (!node || !insertAfter) continue
      insertAfter.insertAfter(node)
      insertAfter = node
    }

    // remove the now-empty paragraph left behind by removeText
    if (
      insertionParent &&
      insertionParent !== insertAfter &&
      insertionParent.getTextContentSize() === 0
    ) {
      insertionParent.remove()
    }
  })
}

export function insertBlocks(editor: LexicalEditor, blocks: AIBlock[]): void {
  if (blocks.length === 0) return

  editor.update(() => {
    const root = $getRoot()
    const selection = $getSelection()
    let insertAfterNode = $isRangeSelection(selection)
      ? selection.anchor.getNode().getTopLevelElementOrThrow()
      : root.getLastChild()

    for (const block of blocks) {
      const node = buildLexicalNode(block)
      if (!node) continue

      if (insertAfterNode) {
        insertAfterNode.insertAfter(node)
        insertAfterNode = node
      } else {
        root.append(node)
        insertAfterNode = node
      }
    }
  })
}

function buildLexicalNode(block: AIBlock) {
  switch (block.type) {
    case 'paragraph': {
      const p = $createParagraphNode()
      p.append($createTextNode(block.text))
      return p
    }

    case 'heading': {
      const tag = `h${block.level}` as 'h1' | 'h2' | 'h3'
      const h = $createHeadingNode(tag)
      h.append($createTextNode(block.text))
      return h
    }

    case 'bullet-list': {
      const list = $createListNode('bullet')
      for (const item of block.items) {
        const li = $createListItemNode()
        li.append($createTextNode(item))
        list.append(li)
      }
      return list
    }

    case 'code': {
      const codeNode = $createCodeNode(block.language)
      codeNode.append($createTextNode(block.code))
      return codeNode
    }

    case 'callout': {
      return $createCalloutNode(block.variant, block.body)
    }

    case 'math': {
      const node = $createMathNode(block.latex)
      node.setDisplayMode(block.displayMode)
      return node
    }

    default:
      return null
  }
}
