// SpreadsheetNode — a grid of cells supporting formulas ("=A1+B1",
// "=SUM(A1:A3)"). Not built on @lexical/table: a real Lexical table cell's
// editable text IS its content, so there's no clean way to type a formula
// but display its computed result inside one. Instead this is a
// DecoratorNode storing a plain 2D array of raw cell strings, with each
// cell a small controlled <input> — showing the raw formula while focused,
// the computed value otherwise. Same DecoratorNode pattern as every other
// custom block here; formula math is the safe parser in formula.ts, not
// eval()/new Function().

import { DecoratorNode, $getNodeByKey } from 'lexical'
import type {
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import { useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { evaluateAt, colIndexToLetter, shiftFormula } from './formula'
import type { Grid } from './formula'

export type SerializedSpreadsheetNode = Spread<
  { cells: string[][] },
  SerializedLexicalNode
>

const DEFAULT_ROWS = 6
const DEFAULT_COLS = 5

function emptyGrid(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''))
}

function makeGrid(cells: string[][]): Grid {
  return {
    rows: cells.length,
    cols: cells[0]?.length ?? 0,
    get: (row, col) => cells[row]?.[col] ?? '',
  }
}

function SpreadsheetComponent({ nodeKey, cells }: { nodeKey: NodeKey; cells: string[][] }) {
  const [editor] = useLexicalComposerContext()
  const [active, setActive] = useState<{ row: number; col: number } | null>(null)
  // What the user is typing in the focused cell. The editor applies setCell
  // asynchronously, so an input driven only by `cells` would be reset to the old
  // text for a moment after each key and the caret would jump to the end,
  // scrambling what is typed. The input shows this draft instead.
  const [draft, setDraft] = useState('')
  // A whole row or column picked by clicking its header (Delete clears it).
  const [sel, setSel] = useState<{ kind: 'row' | 'col'; index: number } | null>(null)

  const rows = cells.length
  const cols = cells[0]?.length ?? 0
  const grid = makeGrid(cells)

  function update(fn: (node: SpreadsheetNode) => void) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof SpreadsheetNode) fn(node)
    })
  }

  function setCell(row: number, col: number, value: string) {
    update((node) => node.setCell(row, col, value))
  }

  // Copies the active cell down (or right) over the rest of its column (row),
  // moving references as it goes, so a formula is typed once, not in every row.
  function fill(direction: 'down' | 'right') {
    if (!active) return
    const { row, col } = active
    update((node) => node.fill(row, col, direction))
  }

  // Delete / Backspace on a selected row or column empties it.
  function onSelectionKey(e: React.KeyboardEvent) {
    if (!sel || (e.key !== 'Delete' && e.key !== 'Backspace')) return
    e.preventDefault()
    update((n) => n.clearLine(sel.kind, sel.index))
  }

  function displayValue(row: number, col: number): string {
    if (active?.row === row && active?.col === col) return draft
    const raw = cells[row][col]
    if (!raw.trim().startsWith('=')) return raw
    try {
      const v = evaluateAt(grid, row, col)
      return String(v)
    } catch {
      return '#ERROR'
    }
  }

  return (
    <div className="sheet-block" contentEditable={false}>
      <div className="sheet-toolbar">
        <button
          type="button"
          className="sheet-toolbar-btn"
          disabled={!active}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => fill('down')}
          title="Copy the selected cell down its column, adjusting cell references (Ctrl+D)"
        >
          Fill ↓
        </button>
        <button
          type="button"
          className="sheet-toolbar-btn"
          disabled={!active}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => fill('right')}
          title="Copy the selected cell across its row, adjusting cell references (Ctrl+R)"
        >
          Fill →
        </button>
        <span className="sheet-toolbar-hint">
          Start a cell with "=" for a formula, e.g. =A1+B1, =SUM(A1:A3) or =SUM(B:B). Fill ↓ copies it down the column. Hover a row or column header to add or remove it; click a header to select it.
        </span>
      </div>

      <div className="sheet-scroll">
        <table className="sheet-table">
          <thead>
            <tr>
              <th className="sheet-corner" />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className={`sheet-col-header${sel?.kind === 'col' && sel.index === c ? ' selected' : ''}`}>
                  <button
                    type="button"
                    className="sheet-header-btn"
                    onClick={() => setSel({ kind: 'col', index: c })}
                    onKeyDown={onSelectionKey}
                    aria-label={`Select column ${colIndexToLetter(c)}`}
                  >
                    {colIndexToLetter(c)}
                  </button>
                  <span className="sheet-header-actions">
                    <button type="button" title="Add a column after this one" aria-label="Add column after" onClick={() => update((n) => n.insertColumn(c + 1))}>+</button>
                    <button type="button" title="Remove this column" aria-label="Remove column" disabled={cols <= 1} onClick={() => { setSel(null); update((n) => n.removeColumnAt(c)) }}>−</button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                <th className={`sheet-row-header${sel?.kind === 'row' && sel.index === r ? ' selected' : ''}`}>
                  <button
                    type="button"
                    className="sheet-header-btn"
                    onClick={() => setSel({ kind: 'row', index: r })}
                    onKeyDown={onSelectionKey}
                    aria-label={`Select row ${r + 1}`}
                  >
                    {r + 1}
                  </button>
                  <span className="sheet-header-actions sheet-header-actions-row">
                    <button type="button" title="Add a row below this one" aria-label="Add row below" onClick={() => update((n) => n.insertRow(r + 1))}>+</button>
                    <button type="button" title="Remove this row" aria-label="Remove row" disabled={rows <= 1} onClick={() => { setSel(null); update((n) => n.removeRowAt(r)) }}>−</button>
                  </span>
                </th>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c} className={`sheet-cell-td${(sel?.kind === 'row' && sel.index === r) || (sel?.kind === 'col' && sel.index === c) ? ' selected' : ''}`}>
                    <input
                      className="sheet-cell-input"
                      value={displayValue(r, c)}
                      onFocus={() => { setSel(null); setActive({ row: r, col: c }); setDraft(cells[r][c]) }}
                      onBlur={() => setActive(null)}
                      onChange={(e) => { setDraft(e.target.value); setCell(r, c, e.target.value) }}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'r')) {
                          e.preventDefault()
                          fill(e.key === 'd' ? 'down' : 'right')
                        }
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export class SpreadsheetNode extends DecoratorNode<React.ReactElement> {
  __cells: string[][]

  static getType(): string {
    return 'spreadsheet'
  }

  static clone(node: SpreadsheetNode): SpreadsheetNode {
    return new SpreadsheetNode(node.__cells, node.__key)
  }

  constructor(cells: string[][] = emptyGrid(DEFAULT_ROWS, DEFAULT_COLS), key?: NodeKey) {
    super(key)
    this.__cells = cells
  }

  exportJSON(): SerializedSpreadsheetNode {
    return { type: 'spreadsheet', version: 1, cells: this.__cells }
  }

  static importJSON(s: SerializedSpreadsheetNode): SpreadsheetNode {
    return new SpreadsheetNode(s.cells)
  }

  setCell(row: number, col: number, value: string): void {
    const self = this.getWritable()
    self.__cells = self.__cells.map((r, ri) =>
      ri === row ? r.map((v, ci) => (ci === col ? value : v)) : r
    )
  }

  /** Copies cell (row, col) over the cells after it in its column ('down') or row ('right'). */
  fill(row: number, col: number, direction: 'down' | 'right'): void {
    const self = this.getWritable()
    const source = self.__cells[row]?.[col]
    if (source === undefined) return
    self.__cells = self.__cells.map((cells, r) =>
      cells.map((value, c) => {
        if (direction === 'down' && c === col && r > row) return shiftFormula(source, r - row, 0)
        if (direction === 'right' && r === row && c > col) return shiftFormula(source, 0, c - col)
        return value
      }),
    )
  }

  insertRow(at: number): void {
    const self = this.getWritable()
    const cols = self.__cells[0]?.length ?? DEFAULT_COLS
    const row = Array.from({ length: cols }, () => '')
    self.__cells = [...self.__cells.slice(0, at), row, ...self.__cells.slice(at)]
  }

  removeRowAt(at: number): void {
    const self = this.getWritable()
    if (self.__cells.length <= 1) return
    self.__cells = self.__cells.filter((_, r) => r !== at)
  }

  insertColumn(at: number): void {
    const self = this.getWritable()
    self.__cells = self.__cells.map((r) => [...r.slice(0, at), '', ...r.slice(at)])
  }

  removeColumnAt(at: number): void {
    const self = this.getWritable()
    if ((self.__cells[0]?.length ?? 0) <= 1) return
    self.__cells = self.__cells.map((r) => r.filter((_, c) => c !== at))
  }

  /** Empties a whole row or column. */
  clearLine(kind: 'row' | 'col', index: number): void {
    const self = this.getWritable()
    self.__cells = self.__cells.map((cells, r) =>
      cells.map((v, c) => ((kind === 'row' ? r === index : c === index) ? '' : v)),
    )
  }

  addRow(): void {
    const self = this.getWritable()
    const cols = self.__cells[0]?.length ?? DEFAULT_COLS
    self.__cells = [...self.__cells, Array.from({ length: cols }, () => '')]
  }

  removeRow(): void {
    const self = this.getWritable()
    if (self.__cells.length <= 1) return
    self.__cells = self.__cells.slice(0, -1)
  }

  addColumn(): void {
    const self = this.getWritable()
    self.__cells = self.__cells.map((r) => [...r, ''])
  }

  removeColumn(): void {
    const self = this.getWritable()
    if ((self.__cells[0]?.length ?? 0) <= 1) return
    self.__cells = self.__cells.map((r) => r.slice(0, -1))
  }

  // Block-level: the default (true) makes Lexical wrap this in a paragraph.
  isInline(): boolean {
    return false
  }

  createDOM(_config: EditorConfig): HTMLElement {
    return document.createElement('div')
  }

  updateDOM(): boolean {
    return false
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement {
    return <SpreadsheetComponent nodeKey={this.getKey()} cells={this.__cells} />
  }
}

export function $createSpreadsheetNode(): SpreadsheetNode {
  return new SpreadsheetNode()
}

export function $isSpreadsheetNode(
  node: LexicalNode | null | undefined,
): node is SpreadsheetNode {
  return node instanceof SpreadsheetNode
}
