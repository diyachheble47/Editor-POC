// DataTableNode — a document table: a dark-tinted header row over plain rows.
// This is what AI-written tables become (the Spreadsheet block stays for
// anything with formulas). Click the table to edit cells, rows and columns.

import { useRef, useState } from 'react'
import { DecoratorNode } from 'lexical'
import type { EditorConfig, LexicalEditor, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical'
import { useBlockData } from '../_shared/useBlockData'

export type TableData = { rows: string[][]; colWidths?: number[] }
export type SerializedDataTableNode = Spread<TableData, SerializedLexicalNode>

const MAX_ROWS = 40
const MAX_COLS = 10
const MIN_COL_WIDTH = 60
export const DEFAULT_ROWS: string[][] = [['Column 1', 'Column 2', 'Column 3'], ['', '', ''], ['', '', '']]

/** Every row the same width, at least 1 x 1. */
export function normalizeRows(rows: string[][]): string[][] {
  const cols = Math.max(1, ...rows.map(r => r.length))
  const out = rows.map(r => Array.from({ length: cols }, (_, i) => String(r[i] ?? '')))
  return out.length ? out : [Array(cols).fill('')]
}

function DataTableComponent({ nodeKey, initial }: { nodeKey: NodeKey; initial: TableData }) {
  const { data, change, editing, setEditing, rootRef } = useBlockData<TableData>(
    nodeKey, initial, (n, d) => { if (n instanceof DataTableNode) { n.setRows(d.rows); n.setColWidths(d.colWidths) } },
  )
  const rows = data.rows
  const cols = rows[0]?.length ?? 1
  const tableRef = useRef<HTMLTableElement>(null)
  // Live widths while actually dragging — kept out of Lexical/`change()` so
  // every pixel of movement doesn't become an editor update; committed once
  // on release. Undefined once not resizing (falls back to the saved data).
  const [liveWidths, setLiveWidths] = useState<number[] | undefined>(undefined)
  const widths = liveWidths ?? data.colWidths
  // A real drag (not just a click) must not also fire the row's own
  // "click anywhere to start editing" — the resize handle already stops the
  // pointerdown from bubbling there, but a plain click event follows the
  // same pointerdown/up pair regardless, so it needs its own guard too.
  const justResizedRef = useRef(false)

  const setCell = (r: number, c: number, v: string) =>
    change({ rows: rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)), colWidths: data.colWidths })
  const addRow = () => rows.length < MAX_ROWS && change({ rows: [...rows, Array(cols).fill('')], colWidths: data.colWidths })
  const addCol = () => cols < MAX_COLS && change({ rows: rows.map((row, i) => [...row, i === 0 ? `Column ${cols + 1}` : '']), colWidths: undefined })
  const delRow = (r: number) => rows.length > 2 && change({ rows: rows.filter((_, i) => i !== r), colWidths: data.colWidths })
  const delCol = (c: number) => cols > 1 && change({ rows: rows.map(row => row.filter((_, j) => j !== c)), colWidths: undefined })

  function startResize(e: React.PointerEvent<HTMLDivElement>, colIndex: number) {
    e.preventDefault()
    e.stopPropagation()
    const table = tableRef.current
    const ths = table?.querySelectorAll('thead tr:last-child th')
    if (!table || !ths) return
    // Seed from the currently rendered widths the first time a column is
    // dragged (nothing saved yet) so every other column keeps its current
    // on-screen size instead of snapping to some default.
    const base = data.colWidths && data.colWidths.length === cols
      ? [...data.colWidths]
      : Array.from(ths).slice(0, cols).map(th => (th as HTMLElement).getBoundingClientRect().width)
    const startX = e.clientX
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    handle.classList.add('active')
    let latest = base
    let moved = false
    const move = (ev: PointerEvent) => {
      moved = true
      const dx = ev.clientX - startX
      latest = base.map((w, i) => (i === colIndex ? Math.max(MIN_COL_WIDTH, w + dx) : w))
      setLiveWidths(latest)
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.classList.remove('active')
      if (moved) {
        justResizedRef.current = true
        change({ rows, colWidths: latest })
      }
      setLiveWidths(undefined)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
  }

  return (
    <div
      ref={rootRef}
      className={`rt-block${editing ? ' rt-editing' : ''}`}
      contentEditable={false}
      onClick={() => {
        if (justResizedRef.current) { justResizedRef.current = false; return }
        if (!editing) setEditing(true)
      }}
    >
      {editing && (
        <div className="rt-toolbar">
          <button type="button" className="rt-btn" onClick={addRow}>+ Row</button>
          <button type="button" className="rt-btn" onClick={addCol}>+ Column</button>
          <span className="rt-hint">The first row is the header. Drag a header's edge to resize its column.</span>
        </div>
      )}
      <div className="rt-scroll">
        <table className="rich-table" ref={tableRef} style={widths ? { tableLayout: 'fixed', width: widths.reduce((a, b) => a + b, 0) } : undefined}>
          {widths && (
            <colgroup>
              {widths.map((w, c) => <col key={c} style={{ width: w }} />)}
              {editing && <col />}
            </colgroup>
          )}
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
                  <div
                    className="rt-col-resizer"
                    onPointerDown={e => startResize(e, c)}
                    onClick={e => e.stopPropagation()}
                    title="Drag to resize column"
                  />
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
  __colWidths: number[] | undefined

  static getType(): string { return 'datatable' }
  static clone(node: DataTableNode): DataTableNode { return new DataTableNode(node.__rows, node.__colWidths, node.__key) }

  constructor(rows: string[][] = DEFAULT_ROWS, colWidths?: number[], key?: NodeKey) {
    super(key)
    this.__rows = normalizeRows(rows)
    this.__colWidths = colWidths
  }

  exportJSON(): SerializedDataTableNode {
    return { type: 'datatable', version: 1, rows: this.__rows, ...(this.__colWidths ? { colWidths: this.__colWidths } : {}) }
  }
  static importJSON(s: SerializedDataTableNode): DataTableNode { return new DataTableNode(s.rows ?? DEFAULT_ROWS, s.colWidths) }

  setRows(rows: string[][]): void { this.getWritable().__rows = normalizeRows(rows) }
  /** Cleared (not kept stale) whenever the column count changes. */
  setColWidths(colWidths: number[] | undefined): void {
    this.getWritable().__colWidths = colWidths && colWidths.length === (this.__rows[0]?.length ?? 0) ? colWidths : undefined
  }

  isInline(): boolean { return false }
  createDOM(_config: EditorConfig): HTMLElement { return document.createElement('div') }
  updateDOM(): boolean { return false }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement {
    return <DataTableComponent nodeKey={this.getKey()} initial={{ rows: this.__rows, colWidths: this.__colWidths }} />
  }
}

export function $createDataTableNode(rows?: string[][]): DataTableNode { return new DataTableNode(rows) }
export function $isDataTableNode(node: LexicalNode | null | undefined): node is DataTableNode { return node instanceof DataTableNode }
