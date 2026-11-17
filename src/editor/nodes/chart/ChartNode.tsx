// ChartNode — bar, line and pie charts drawn as plain SVG (no chart library,
// so no bundle or RAM cost). The data is a small table: one label per row and
// one or more series (columns). Click the chart to edit its type and data.

import { DecoratorNode, $getNodeByKey } from 'lexical'
import type {
  EditorConfig, LexicalEditor, LexicalNode, NodeKey, SerializedLexicalNode, Spread,
} from 'lexical'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

export type ChartType = 'bar' | 'line' | 'pie'
export type ChartSeries = { name: string; values: number[] }
export type ChartData = { title: string; chartType: ChartType; labels: string[]; series: ChartSeries[] }

export type SerializedChartNode = Spread<ChartData, SerializedLexicalNode>

export const DEFAULT_CHART: ChartData = {
  title: 'Chart title',
  chartType: 'bar',
  labels: ['A', 'B', 'C', 'D'],
  series: [{ name: 'Series 1', values: [12, 19, 8, 15] }],
}

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
const W = 560, H = 300
const M = { l: 48, r: 16, t: 16, b: 40 }

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

function ChartSvg({ data }: { data: ChartData }) {
  const { chartType, labels, series } = data
  const all = series.flatMap(s => s.values.map(v => (Number.isFinite(v) ? v : 0)))
  const lo = Math.min(0, ...all)
  const hi = niceMax(Math.max(0, ...all))
  const span = hi - lo || 1
  const plotW = W - M.l - M.r, plotH = H - M.t - M.b
  const y = (v: number) => M.t + plotH - ((v - lo) / span) * plotH
  const step = plotW / Math.max(labels.length, 1)

  if (chartType === 'pie') {
    const vals = (series[0]?.values ?? []).map(v => Math.max(0, Number.isFinite(v) ? v : 0))
    const total = vals.reduce((a, b) => a + b, 0)
    const cx = 170, cy = H / 2, r = 110
    let angle = -Math.PI / 2
    return (
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={data.title}>
        {total > 0 && vals.map((v, i) => {
          const a2 = angle + (v / total) * Math.PI * 2
          const large = a2 - angle > Math.PI ? 1 : 0
          const d = vals.filter(x => x > 0).length === 1
            ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`
            : `M ${cx} ${cy} L ${cx + r * Math.cos(angle)} ${cy + r * Math.sin(angle)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)} Z`
          angle = a2
          return v > 0 ? <path key={i} d={d} fill={COLORS[i % COLORS.length]} stroke="var(--c-ground)" strokeWidth={2} /> : null
        })}
        {labels.map((l, i) => (
          <g key={i} transform={`translate(330 ${40 + i * 24})`}>
            <rect width={12} height={12} rx={2} fill={COLORS[i % COLORS.length]} />
            <text x={20} y={11} className="chart-label">
              {l || `#${i + 1}`} — {fmt(vals[i] ?? 0)}{total > 0 ? ` (${Math.round(((vals[i] ?? 0) / total) * 100)}%)` : ''}
            </text>
          </g>
        ))}
      </svg>
    )
  }

  const ticks = Array.from({ length: 6 }, (_, i) => lo + (span * i) / 5)
  const barW = Math.min(46, (step * 0.7) / Math.max(series.length, 1))
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={data.title}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="chart-grid" />
          <text x={M.l - 6} y={y(t) + 4} textAnchor="end" className="chart-label">{fmt(t)}</text>
        </g>
      ))}
      <line x1={M.l} x2={W - M.r} y1={y(0)} y2={y(0)} className="chart-axis" />
      {labels.map((l, i) => (
        <text key={i} x={M.l + step * (i + 0.5)} y={H - M.b + 16} textAnchor="middle" className="chart-label">{l}</text>
      ))}
      {chartType === 'bar' && series.map((s, si) => s.values.map((v, i) => {
        const val = Number.isFinite(v) ? v : 0
        const x = M.l + step * (i + 0.5) - (barW * series.length) / 2 + si * barW
        return <rect key={`${si}-${i}`} x={x} y={Math.min(y(val), y(0))} width={barW - 2} height={Math.abs(y(val) - y(0))} rx={2} fill={COLORS[si % COLORS.length]} />
      }))}
      {chartType === 'line' && series.map((s, si) => {
        const pts = s.values.map((v, i) => [M.l + step * (i + 0.5), y(Number.isFinite(v) ? v : 0)] as const)
        return (
          <g key={si}>
            <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke={COLORS[si % COLORS.length]} strokeWidth={2.5} />
            {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={4} fill={COLORS[si % COLORS.length]} />)}
          </g>
        )
      })}
      {series.length > 1 && series.map((s, si) => (
        <g key={si} transform={`translate(${M.l + si * 110} ${H - 12})`}>
          <rect width={10} height={10} rx={2} fill={COLORS[si % COLORS.length]} />
          <text x={15} y={9} className="chart-label">{s.name}</text>
        </g>
      ))}
    </svg>
  )
}

function ChartComponent({ nodeKey, initial }: { nodeKey: NodeKey; initial: ChartData }) {
  const [editor] = useLexicalComposerContext()
  const [data, setData] = useState<ChartData>(initial)
  const [editing, setEditing] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const initialKey = useMemo(() => JSON.stringify(initial), [initial])

  // Undo/redo replace the node's data; mirror it (our own edits already match).
  useEffect(() => { setData(prev => (JSON.stringify(prev) === initialKey ? prev : initial)) }, [initialKey, initial])

  useEffect(() => {
    if (!editing) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as globalThis.Node)) setEditing(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [editing])

  function change(next: ChartData) {
    setData(next)
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof ChartNode) node.setData(next)
    })
  }

  const setLabel = (i: number, v: string) => change({ ...data, labels: data.labels.map((l, k) => (k === i ? v : l)) })
  const setValue = (si: number, i: number, v: string) => change({
    ...data,
    series: data.series.map((s, k) => (k === si ? { ...s, values: s.values.map((x, j) => (j === i ? (v === '' || v === '-' ? 0 : Number(v) || 0) : x)) } : s)),
  })
  const addRow = () => change({
    ...data,
    labels: [...data.labels, `Item ${data.labels.length + 1}`],
    series: data.series.map(s => ({ ...s, values: [...s.values, 0] })),
  })
  const removeRow = (i: number) => data.labels.length > 1 && change({
    ...data,
    labels: data.labels.filter((_, k) => k !== i),
    series: data.series.map(s => ({ ...s, values: s.values.filter((_, k) => k !== i) })),
  })
  const addSeries = () => data.series.length < 4 && change({
    ...data,
    series: [...data.series, { name: `Series ${data.series.length + 1}`, values: data.labels.map(() => 0) }],
  })
  const removeSeries = (si: number) => data.series.length > 1 && change({ ...data, series: data.series.filter((_, k) => k !== si) })

  return (
    <div
      ref={rootRef}
      className={`chart-block${editing ? ' chart-editing' : ''}`}
      contentEditable={false}
      onClick={() => { if (!editing) setEditing(true) }}
    >
      {editing ? (
        <input
          className="chart-title-input"
          value={data.title}
          onChange={e => change({ ...data, title: e.target.value })}
          onKeyDown={e => e.stopPropagation()}
          placeholder="Chart title"
          aria-label="Chart title"
        />
      ) : data.title && <div className="chart-title">{data.title}</div>}

      <ChartSvg data={data} />

      {editing && (
        <div className="chart-editor">
          <div className="graph-toolbar">
            {(['bar', 'line', 'pie'] as ChartType[]).map(t => (
              <button key={t} type="button" className={`graph-mode-btn${data.chartType === t ? ' active' : ''}`} onClick={() => change({ ...data, chartType: t })}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
            <button type="button" className="graph-mode-btn" onClick={addRow}>+ Row</button>
            {data.chartType !== 'pie' && <button type="button" className="graph-mode-btn" onClick={addSeries}>+ Series</button>}
          </div>
          <table className="chart-table">
            <thead>
              <tr>
                <th>Label</th>
                {(data.chartType === 'pie' ? data.series.slice(0, 1) : data.series).map((s, si) => (
                  <th key={si}>
                    <input
                      value={s.name}
                      onChange={e => change({ ...data, series: data.series.map((x, k) => (k === si ? { ...x, name: e.target.value } : x)) })}
                      onKeyDown={e => e.stopPropagation()}
                      aria-label="Series name"
                    />
                    {data.series.length > 1 && data.chartType !== 'pie' && (
                      <button type="button" className="chart-x" onClick={() => removeSeries(si)} title="Remove series">×</button>
                    )}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {data.labels.map((l, i) => (
                <tr key={i}>
                  <td><input value={l} onChange={e => setLabel(i, e.target.value)} onKeyDown={e => e.stopPropagation()} aria-label="Label" /></td>
                  {(data.chartType === 'pie' ? data.series.slice(0, 1) : data.series).map((s, si) => (
                    <td key={si}>
                      <input
                        inputMode="decimal"
                        defaultValue={String(s.values[i] ?? 0)}
                        key={`${si}-${i}-${initialKey === JSON.stringify(data) ? '' : 'x'}`}
                        onChange={e => setValue(si, i, e.target.value)}
                        onKeyDown={e => e.stopPropagation()}
                        aria-label="Value"
                      />
                    </td>
                  ))}
                  <td><button type="button" className="chart-x" onClick={() => removeRow(i)} title="Remove row">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export class ChartNode extends DecoratorNode<React.ReactElement> {
  __data: ChartData

  static getType(): string { return 'chart' }

  static clone(node: ChartNode): ChartNode { return new ChartNode(node.__data, node.__key) }

  constructor(data: ChartData = DEFAULT_CHART, key?: NodeKey) {
    super(key)
    this.__data = data
  }

  exportJSON(): SerializedChartNode {
    return { type: 'chart', version: 1, ...this.__data }
  }

  static importJSON(s: SerializedChartNode): ChartNode {
    return new ChartNode({
      title: s.title ?? '', chartType: s.chartType ?? 'bar', labels: s.labels ?? [], series: s.series ?? [],
    })
  }

  setData(data: ChartData): void { this.getWritable().__data = data }

  isInline(): boolean { return false }
  createDOM(_config: EditorConfig): HTMLElement { return document.createElement('div') }
  updateDOM(): boolean { return false }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement {
    return <ChartComponent nodeKey={this.getKey()} initial={this.__data} />
  }
}

export function $createChartNode(data?: ChartData): ChartNode { return new ChartNode(data) }
export function $isChartNode(node: LexicalNode | null | undefined): node is ChartNode { return node instanceof ChartNode }
