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
import { evaluateCell, colIndexToLetter } from './formula'
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

  function displayValue(row: number, col: number): string {
    if (active?.row === row && active?.col === col) return cells[row][col]
    const raw = cells[row][col]
    if (!raw.trim().startsWith('=')) return raw
    try {
      const v = evaluateCell(raw, grid)
      return String(v)
    } catch {
      return '#ERROR'
    }
  }

  return (
    <div className="sheet-block" contentEditable={false}>
      <div className="sheet-toolbar">
        <button type="button" className="sheet-toolbar-btn" onClick={() => update((n) => n.addRow())}>+ Row</button>
        <button type="button" className="sheet-toolbar-btn" onClick={() => update((n) => n.removeRow())} disabled={rows <= 1}>− Row</button>
        <button type="button" className="sheet-toolbar-btn" onClick={() => update((n) => n.addColumn())}>+ Col</button>
        <button type="button" className="sheet-toolbar-btn" onClick={() => update((n) => n.removeColumn())} disabled={cols <= 1}>− Col</button>
        <span className="sheet-toolbar-hint">Start a cell with "=" for a formula, e.g. =SUM(A1:A3)</span>
      </div>

      <div className="sheet-scroll">
        <table className="sheet-table">
          <thead>
            <tr>
              <th className="sheet-corner" />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className="sheet-col-header">{colIndexToLetter(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                <th className="sheet-row-header">{r + 1}</th>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c} className="sheet-cell-td">
                    <input
                      className="sheet-cell-input"
                      value={displayValue(r, c)}
                      onFocus={() => setActive({ row: r, col: c })}
                      onBlur={() => setActive(null)}
                      onChange={(e) => setCell(r, c, e.target.value)}
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
