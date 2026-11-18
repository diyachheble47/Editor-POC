// DataTableNode — a document table: a dark-tinted header row over plain rows.
// This is what AI-written tables become (the Spreadsheet block stays for
// anything with formulas). Click the table to edit cells, rows and columns.

import { DecoratorNode } from 'lexical'
import type { EditorConfig, LexicalEditor, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical'
import { useBlockData } from '../_shared/useBlockData'

export type TableData = { rows: string[][] }
export type SerializedDataTableNode = Spread<TableData, SerializedLexicalNode>

const MAX_ROWS = 40
const MAX_COLS = 10
export const DEFAULT_ROWS: string[][] = [['Column 1', 'Column 2', 'Column 3'], ['', '', ''], ['', '', '']]

/** Every row the same width, at least 1 x 1. */
export function normalizeRows(rows: string[][]): string[][] {
  const cols = Math.max(1, ...rows.map(r => r.length))
  const out = rows.map(r => Array.from({ length: cols }, (_, i) => String(r[i] ?? '')))
  return out.length ? out : [Array(cols).fill('')]
}

function DataTableComponent({ nodeKey, initial }: { nodeKey: NodeKey; initial: TableData }) {
  const { data, change, editing, setEditing, rootRef } = useBlockData<TableData>(
    nodeKey, initial, (n, d) => { if (n instanceof DataTableNode) n.setRows(d.rows) },
  )
  const rows = data.rows
  const cols = rows[0]?.length ?? 1

  const setCell = (r: number, c: number, v: string) =>
    change({ rows: rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) })
  const addRow = () => rows.length < MAX_ROWS && change({ rows: [...rows, Array(cols).fill('')] })
  const addCol = () => cols < MAX_COLS && change({ rows: rows.map((row, i) => [...row, i === 0 ? `Column ${cols + 1}` : '']) })
  const delRow = (r: number) => rows.length > 2 && change({ rows: rows.filter((_, i) => i !== r) })
  const delCol = (c: number) => cols > 1 && change({ rows: rows.map(row => row.filter((_, j) => j !== c)) })

  return (
    <div
      ref={rootRef}
      className={`rt-block${editing ? ' rt-editing' : ''}`}
      contentEditable={false}
      onClick={() => { if (!editing) setEditing(true) }}
    >
      {editing && (
        <div className="rt-toolbar">
          <button type="button" className="rt-btn" onClick={addRow}>+ Row</button>
          <button type="button" className="rt-btn" onClick={addCol}>+ Column</button>
          <span className="rt-hint">The first row is the header.</span>
        </div>
      )}
      <div className="rt-scroll">
        <table className="rich-table">
          <thead>
            {editing && cols > 1 && (
              <tr className="rt-col-actions">
                {rows[0].map((_, c) => (
                  <td key={c}><button type="button" className="rt-x" onClick={() => delCol(c)} title="Remove column">×</button></td>
                ))}
                <td />
              </tr>
            )}
            <tr>
              {rows[0].map((cell, c) => (
                <th key={c}>
                  {editing
                    ? <input value={cell} onChange={e => setCell(0, c, e.target.value)} onKeyDown={e => e.stopPropagation()} aria-label="Header" />
                    : cell}
                </th>
              ))}
              {editing && <th className="rt-row-actions" />}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((row, i) => (
              <tr key={i}>
                {row.map((cell, c) => (
                  <td key={c}>
                    {editing
                      ? <input value={cell} onChange={e => setCell(i + 1, c, e.target.value)} onKeyDown={e => e.stopPropagation()} aria-label="Cell" />
                      : cell}
                  </td>
                ))}
                {editing && (
                  <td className="rt-row-actions">
                    {rows.length > 2 && <button type="button" className="rt-x" onClick={() => delRow(i + 1)} title="Remove row">×</button>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export class DataTableNode extends DecoratorNode<React.ReactElement> {
  __rows: string[][]

  static getType(): string { return 'datatable' }
  static clone(node: DataTableNode): DataTableNode { return new DataTableNode(node.__rows, node.__key) }

  constructor(rows: string[][] = DEFAULT_ROWS, key?: NodeKey) {
    super(key)
    this.__rows = normalizeRows(rows)
  }

  exportJSON(): SerializedDataTableNode { return { type: 'datatable', version: 1, rows: this.__rows } }
  static importJSON(s: SerializedDataTableNode): DataTableNode { return new DataTableNode(s.rows ?? DEFAULT_ROWS) }

  setRows(rows: string[][]): void { this.getWritable().__rows = normalizeRows(rows) }

  isInline(): boolean { return false }
  createDOM(_config: EditorConfig): HTMLElement { return document.createElement('div') }
  updateDOM(): boolean { return false }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement {
    return <DataTableComponent nodeKey={this.getKey()} initial={{ rows: this.__rows }} />
  }
}

export function $createDataTableNode(rows?: string[][]): DataTableNode { return new DataTableNode(rows) }
export function $isDataTableNode(node: LexicalNode | null | undefined): node is DataTableNode { return node instanceof DataTableNode }
