// Size picker for the Table block — same hover-a-grid approach as the Matrix
// block's picker (MatrixPickerPlugin), since Table isn't built on
// @lexical/table (see DataTableNode) and so can't just dispatch
// INSERT_TABLE_COMMAND; it builds its own starter rows/header instead.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_EDITOR, createCommand } from 'lexical'
import { insertDecoratorNode } from '../../blockRegistry'
import { $createDataTableNode } from './DataTableNode'

export const OPEN_DATATABLE_PICKER_COMMAND = createCommand<void>('OPEN_DATATABLE_PICKER_COMMAND')

const MAX_ROWS = 8
const MAX_COLS = 8
const PICKER_WIDTH = 190
const PICKER_HEIGHT = 230

/** First row is "Column 1", "Column 2", … (the header); the rest start empty. */
function buildStarterRows(rows: number, cols: number): string[][] {
  const header = Array.from({ length: cols }, (_, c) => `Column ${c + 1}`)
  const body = Array.from({ length: Math.max(0, rows - 1) }, () => Array(cols).fill(''))
  return [header, ...body]
}

export function DataTablePickerPlugin() {
  const [editor] = useLexicalComposerContext()
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const [hover, setHover] = useState({ row: 0, col: 0 })
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return editor.registerCommand(
      OPEN_DATATABLE_PICKER_COMMAND,
      () => {
        // See MatrixPickerPlugin's own version of this comment: the caret
        // position comes from Lexical's last-known selection, not
        // window.getSelection(), since choosing "Table" from the slash menu
        // or sidebar has already moved DOM focus away from the editor.
        const rect = editor.getEditorState().read((): DOMRect | null => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return null
          const dom = editor.getElementByKey(selection.anchor.getNode().getKey())
          return dom ? dom.getBoundingClientRect() : null
        })
        const x = rect ? rect.left : window.innerWidth / 2
        const y = rect ? rect.bottom + 6 : window.innerHeight / 2
        setAnchor({
          x: Math.min(x, window.innerWidth - PICKER_WIDTH - 8),
          y: Math.min(y, window.innerHeight - PICKER_HEIGHT - 8),
        })
        setHover({ row: 0, col: 0 })
        return true
      },
      COMMAND_PRIORITY_EDITOR,
    )
  }, [editor])

  // Click outside closes without inserting anything.
  useEffect(() => {
    if (!anchor) return
    function onPointerDown(e: PointerEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) setAnchor(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [anchor])

  if (!anchor) return null

  function pick(rows: number, cols: number) {
    insertDecoratorNode(editor, () => $createDataTableNode(buildStarterRows(rows, cols)))
    setAnchor(null)
  }

  return createPortal(
    <div
      ref={pickerRef}
      className="matrix-picker"
      style={{ left: anchor.x, top: anchor.y }}
    >
      <div className="matrix-picker-grid">
        {Array.from({ length: MAX_ROWS }, (_, row) => (
          <div key={row} className="matrix-picker-row">
            {Array.from({ length: MAX_COLS }, (_, col) => (
              <div
                key={col}
                className={`matrix-picker-cell${row <= hover.row && col <= hover.col ? ' filled' : ''}`}
                onMouseEnter={() => setHover({ row, col })}
                onClick={() => pick(row + 1, col + 1)}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="matrix-picker-label">{hover.row + 1} × {hover.col + 1} table</div>
    </div>,
    document.body,
  )
}
