// Keyboard behavior for the Columns layout block.
//
// Columns are ElementNodes nested two levels deep (root > columns-container >
// columns-item > paragraph…), not separate nested editors. Lexical's default
// deleteBackward/deleteForward logic walks *up* through ancestors looking for
// something to merge with when it hits an edge with nothing left to delete —
// and when that walk crosses a column boundary, it can end up merging or
// deleting content far outside the column entirely (verified: pressing
// Backspace at the very start of a column's text deleted an unrelated
// paragraph several blocks above the columns layout). Marking ColumnNode as
// a Lexical "shadow root" doesn't fully prevent this in all cases, so instead
// we intercept Backspace/Delete explicitly at column edges and simply no-op
// — the column boundary is a hard wall, matching how adjacent columns in a
// real document aren't supposed to merge into each other anyway.
//
// Tab / Shift+Tab are added on top as a convenience to jump between columns
// without reaching for the mouse.

import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import {
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_TAB_COMMAND,
} from 'lexical'
import type { LexicalNode, RangeSelection } from 'lexical'
import { $isColumnNode } from '../nodes/columns/ColumnsNode'
import type { ColumnNode } from '../nodes/columns/ColumnsNode'

function $getAncestorColumn(node: LexicalNode): ColumnNode | null {
  let n: LexicalNode | null = node
  while (n) {
    if ($isColumnNode(n)) return n
    n = n.getParent()
  }
  return null
}

// Is the collapsed selection sitting at the very start/end of its column,
// i.e. there's nothing left to delete/merge in that direction without
// leaving the column?
function $getColumnAtEdge(selection: RangeSelection, edge: 'start' | 'end'): ColumnNode | null {
  if (!selection.isCollapsed()) return null
  const point = edge === 'start' ? selection.anchor : selection.focus
  const node = point.getNode()
  const column = $getAncestorColumn(node)
  if (!column) return null

  const size = $isTextNode(node) ? node.getTextContentSize() : node.getChildrenSize()
  if (edge === 'start' ? point.offset !== 0 : point.offset !== size) return null

  let n: LexicalNode = node
  while (!n.is(column)) {
    const sibling = edge === 'start' ? n.getPreviousSibling() : n.getNextSibling()
    if (sibling) return null
    const parent = n.getParent()
    if (!parent) return null
    n = parent
  }
  return column
}

export function ColumnsPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        () => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return false
          return $getColumnAtEdge(selection, 'start') !== null
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        () => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return false
          return $getColumnAtEdge(selection, 'end') !== null
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return false
          const column = $getAncestorColumn(selection.anchor.getNode())
          if (!column) return false

          const target = event.shiftKey ? column.getPreviousSibling() : column.getNextSibling()
          if (!$isColumnNode(target)) return false

          event.preventDefault()
          const edgeChild = event.shiftKey ? target.getLastChild() : target.getFirstChild()
          if ($isElementNode(edgeChild)) {
            event.shiftKey ? edgeChild.selectEnd() : edgeChild.selectStart()
          } else {
            event.shiftKey ? target.selectEnd() : target.selectStart()
          }
          return true
        },
        COMMAND_PRIORITY_HIGH,
      ),
    )
  }, [editor])

  return null
}
