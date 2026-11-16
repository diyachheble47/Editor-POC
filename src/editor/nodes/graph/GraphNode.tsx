// GraphNode — a coordinate-plane block: click to place points, connect them
// with lines, and plot typed functions (e.g. "x^2 + 1") on the same axes.
//
// Architecture: same DecoratorNode pattern as CalloutNode/MathNode — all
// state (points, edges, functions) lives on the Lexical node as plain data;
// GraphComponent is a presentational SVG renderer that writes back only via
// editor.update(). Rendering is plain inline SVG (no charting library), and
// function plotting uses the hand-written safe expression parser in
// expr.ts instead of eval()/new Function().

import { DecoratorNode, $getNodeByKey } from 'lexical'
import type {
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import { useMemo, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { compileExpr } from './expr'
import { RANGE, SIZE, toPx, toData, snap, makePointId, gridLines as sharedGridLines } from '../_shared/plane'
import type { PlanePoint } from '../_shared/plane'

export type GraphPoint = PlanePoint
export type GraphEdge = [string, string]

export type SerializedGraphNode = Spread<
  { points: GraphPoint[]; edges: GraphEdge[]; functions: string[] },
  SerializedLexicalNode
>

const FN_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6']

function GraphComponent({
  nodeKey,
  points,
  edges,
  functions,
}: {
  nodeKey: NodeKey
  points: GraphPoint[]
  edges: GraphEdge[]
  functions: string[]
}) {
  const [editor] = useLexicalComposerContext()
  const [mode, setMode] = useState<'point' | 'line'>('point')
  const [selected, setSelected] = useState<string | null>(null)
  const [fnDraft, setFnDraft] = useState('')

  function update(fn: (node: GraphNode) => void) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof GraphNode) fn(node)
    })
  }

  function handleBackgroundClick(e: React.MouseEvent<SVGSVGElement>) {
    if (mode !== 'point') return
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * SIZE
    const py = ((e.clientY - rect.top) / rect.height) * SIZE
    const [dx, dy] = toData(px, py)
    const x = snap(dx)
    const y = snap(dy)
    if (Math.abs(x) > RANGE || Math.abs(y) > RANGE) return
    update((node) => node.addPoint({ id: makePointId(), x, y }))
  }

  function handlePointClick(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (mode === 'point') {
      update((node) => node.removePoint(id))
      return
    }
    // Line mode: first click selects, second click on a different point connects them.
    if (selected === null) {
      setSelected(id)
    } else if (selected === id) {
      setSelected(null)
    } else {
      update((node) => node.toggleEdge(selected, id))
      setSelected(null)
    }
  }

  function addFunction() {
    const expr = fnDraft.trim()
    if (!expr) return
    try {
      compileExpr(expr) // validate before storing
      update((node) => node.addFunction(expr))
      setFnDraft('')
    } catch {
      // Invalid expression — leave the draft so the user can fix it;
      // the function list below shows the same parse error inline.
    }
  }

  const gridLines = useMemo(() => sharedGridLines(), [])

  const pointById = useMemo(() => new Map(points.map(p => [p.id, p])), [points])

  const curves = useMemo(() => {
    return functions.map((expr, i) => {
      try {
        const fn = compileExpr(expr)
        const step = (RANGE * 2) / 200
        const pts: string[] = []
        for (let x = -RANGE; x <= RANGE; x += step) {
          const y = fn(x)
          if (!Number.isFinite(y)) continue
          const [px, py] = toPx(x, y)
          pts.push(`${px},${py}`)
        }
        return { expr, color: FN_COLORS[i % FN_COLORS.length], path: pts.join(' '), error: null as string | null }
      } catch (err) {
        return { expr, color: FN_COLORS[i % FN_COLORS.length], path: '', error: String(err instanceof Error ? err.message : err) }
      }
    })
  }, [functions])

  return (
    <div className="graph-block" contentEditable={false}>
      <div className="graph-toolbar">
        <button
          type="button"
          className={`graph-mode-btn${mode === 'point' ? ' active' : ''}`}
          onClick={() => { setMode('point'); setSelected(null) }}
        >
          Point
        </button>
        <button
          type="button"
          className={`graph-mode-btn${mode === 'line' ? ' active' : ''}`}
          onClick={() => setMode('line')}
        >
          Connect
        </button>
        <span className="graph-toolbar-hint">
          {mode === 'point'
            ? 'Click the grid to add a point, click a point to remove it.'
            : selected
              ? 'Click another point to connect it.'
              : 'Click a point, then another to connect them.'}
        </span>
      </div>

      <svg
        className="graph-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        onClick={handleBackgroundClick}
      >
        {gridLines.map((l, i) => (
          <line
            key={i}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            className={l.major ? 'graph-axis' : 'graph-gridline'}
          />
        ))}

        {edges.map(([a, b], i) => {
          const pa = pointById.get(a)
          const pb = pointById.get(b)
          if (!pa || !pb) return null
          const [x1, y1] = toPx(pa.x, pa.y)
          const [x2, y2] = toPx(pb.x, pb.y)
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="graph-edge" />
        })}

        {curves.map((c, i) => c.path && (
          <polyline key={i} points={c.path} className="graph-curve" style={{ stroke: c.color }} />
        ))}

        {points.map((p) => {
          const [px, py] = toPx(p.x, p.y)
          return (
            <g key={p.id} onClick={(e) => handlePointClick(e, p.id)}>
              <circle
                cx={px} cy={py} r={6}
                className={`graph-point${selected === p.id ? ' selected' : ''}`}
              />
              <text x={px + 9} y={py - 7} className="graph-point-label">
                ({p.x}, {p.y})
              </text>
            </g>
          )
        })}
      </svg>

      <div className="graph-functions">
        {curves.map((c, i) => (
          <div key={i} className="graph-fn-item">
            <span className="graph-fn-swatch" style={{ background: c.color }} />
            <span className="graph-fn-expr">y = {c.expr}</span>
            {c.error && <span className="graph-fn-error" title={c.error}>invalid</span>}
            <button type="button" className="graph-fn-remove" onClick={() => update((node) => node.removeFunction(i))}>×</button>
          </div>
        ))}
        <div className="graph-fn-add">
          <span className="graph-fn-add-prefix">y =</span>
          <input
            className="graph-fn-input"
            placeholder="x^2 + 1"
            value={fnDraft}
            onChange={e => setFnDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addFunction() }}
          />
          <button type="button" className="graph-fn-add-btn" onClick={addFunction}>Plot</button>
        </div>
      </div>
    </div>
  )
}

export class GraphNode extends DecoratorNode<React.ReactElement> {
  __points: GraphPoint[]
  __edges: GraphEdge[]
  __functions: string[]

  static getType(): string {
    return 'graph'
  }

  static clone(node: GraphNode): GraphNode {
    return new GraphNode(node.__points, node.__edges, node.__functions, node.__key)
  }

  constructor(points: GraphPoint[] = [], edges: GraphEdge[] = [], functions: string[] = [], key?: NodeKey) {
    super(key)
    this.__points = points
    this.__edges = edges
    this.__functions = functions
  }

  exportJSON(): SerializedGraphNode {
    return {
      type: 'graph',
      version: 1,
      points: this.__points,
      edges: this.__edges,
      functions: this.__functions,
    }
  }

  static importJSON(s: SerializedGraphNode): GraphNode {
    return new GraphNode(s.points, s.edges, s.functions)
  }

  addPoint(point: GraphPoint): void {
    const self = this.getWritable()
    self.__points = [...self.__points, point]
  }

  removePoint(id: string): void {
    const self = this.getWritable()
    self.__points = self.__points.filter(p => p.id !== id)
    self.__edges = self.__edges.filter(([a, b]) => a !== id && b !== id)
  }

  toggleEdge(a: string, b: string): void {
    const self = this.getWritable()
    const exists = self.__edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
    self.__edges = exists
      ? self.__edges.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a)))
      : [...self.__edges, [a, b]]
  }

  addFunction(expr: string): void {
    const self = this.getWritable()
    self.__functions = [...self.__functions, expr]
  }

  removeFunction(index: number): void {
    const self = this.getWritable()
    self.__functions = self.__functions.filter((_, i) => i !== index)
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
    return (
      <GraphComponent
        nodeKey={this.getKey()}
        points={this.__points}
        edges={this.__edges}
        functions={this.__functions}
      />
    )
  }
}

export function $createGraphNode(): GraphNode {
  return new GraphNode()
}

export function $isGraphNode(
  node: LexicalNode | null | undefined,
): node is GraphNode {
  return node instanceof GraphNode
}
