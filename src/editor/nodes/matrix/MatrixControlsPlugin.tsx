// Floating +/- row/column controls for a matrix — shown whenever the cursor
// sits inside one. All four actions are Lexical's own table utilities
// (operating on whatever cell the selection is currently in); this plugin
// only has to track selection and draw four buttons next to the table.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection } from 'lexical'
import { $findMatchingParent } from '@lexical/utils'
import {
  $isTableCellNode,
  $isTableNode,
  $insertTableRowAtSelection,
  $insertTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $deleteTableColumnAtSelection,
} from '@lexical/table'

export function MatrixControlsPlugin() {
  const [editor] = useLexicalComposerContext()
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          setRect(null)
          return
        }
        const cell = $findMatchingParent(selection.anchor.getNode(), $isTableCellNode)
        const table = cell && $findMatchingParent(cell, $isTableNode)
        if (!table) {
          setRect(null)
          return
        }
        const tableEl = editor.getElementByKey(table.getKey())
        setRect(tableEl ? tableEl.getBoundingClientRect() : null)
      })
    })
  }, [editor])

  if (!rect) return null

  function run(action: () => void) {
    editor.update(action)
  }

  return createPortal(
    <div
      className="matrix-controls"
      style={{ left: rect.right + 8, top: rect.top }}
      contentEditable={false}
    >
      <button type="button" title="Add row" onClick={() => run(() => $insertTableRowAtSelection(true))}>+row</button>
      <button type="button" title="Remove row" onClick={() => run(() => $deleteTableRowAtSelection())}>−row</button>
      <button type="button" title="Add column" onClick={() => run(() => $insertTableColumnAtSelection(true))}>+col</button>
      <button type="button" title="Remove column" onClick={() => run(() => $deleteTableColumnAtSelection())}>−col</button>
    </div>,
    document.body,
  )
}
