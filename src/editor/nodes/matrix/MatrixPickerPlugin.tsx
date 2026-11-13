// Size picker for the Matrix block — the only custom UI this feature needs.
// Everything else (cell editing, selection, keyboard nav, copy/paste, the
// actual row/column insertion) comes from Lexical's own @lexical/table
// package via INSERT_TABLE_COMMAND; we just ask it for the size the user
// picked, the same way a slash command dispatches any other insert command.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_EDITOR, createCommand } from 'lexical'
import { INSERT_TABLE_COMMAND } from '@lexical/table'

export const OPEN_MATRIX_PICKER_COMMAND = createCommand<void>('OPEN_MATRIX_PICKER_COMMAND')

const MAX_ROWS = 8
const MAX_COLS = 8
// Rough picker footprint, used to keep it fully on-screen — see the
// clamping below (the same off-screen problem the slash menu had).
const PICKER_WIDTH = 190
const PICKER_HEIGHT = 230

export function MatrixPickerPlugin() {
  const [editor] = useLexicalComposerContext()
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const [hover, setHover] = useState({ row: 0, col: 0 })
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return editor.registerCommand(
      OPEN_MATRIX_PICKER_COMMAND,
      () => {
        // Read the caret position from Lexical's own selection model rather
        // than window.getSelection() — clicking the "Matrix" button (in the
        // sidebar, or the slash menu) moves DOM focus away from the
        // contentEditable first, which can leave the native Selection API
        // pointing at nothing. Lexical's last-known selection still has the
        // real cursor location regardless of what currently has DOM focus.
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
    editor.dispatchCommand(INSERT_TABLE_COMMAND, {
      rows: String(rows),
      columns: String(cols),
      includeHeaders: false,
    })
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
      <div className="matrix-picker-label">{hover.row + 1} × {hover.col + 1} matrix</div>
    </div>,
    document.body,
  )
}
