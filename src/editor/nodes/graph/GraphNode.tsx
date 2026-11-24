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
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useReadOnly } from '../_shared/readOnlyContext'
import { plotToLatex } from './latex'
import { checkPlot, isParametric } from './parametric'
import { makePointId } from '../_shared/plane'
import type { PlanePoint } from '../_shared/plane'

export type GraphPoint = PlanePoint
export type GraphEdge = [string, string]

export type SerializedGraphNode = Spread<
  { points: GraphPoint[]; edges: GraphEdge[]; functions: string[] },
  SerializedLexicalNode
>

// JSXGraph (axes, plots, draggable points) is fetched only when a document has a graph.
const GraphBoard = lazy(() => import('./GraphBoard'))

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
  const [fnError, setFnError] = useState<string | null>(null)
  // The editing controls (Point/Connect, the Plot input, remove ×) show only
  // while the user is working on this graph; click outside and just the graph
  // and its equations remain.
  // A brand-new (empty) graph opens in editing mode so the Plot input is visible.
  const readOnly = useReadOnly() // Preview: pan/zoom still work, the editing toolbar never opens
  const [editing, setEditing] = useState(points.length + edges.length + functions.length === 0 && !readOnly)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editing) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setEditing(false)
        setSelected(null)
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [editing])

  function update(fn: (node: GraphNode) => void) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof GraphNode) fn(node)
    })
  }

  function handleBackgroundClick(x: number, y: number) {
    if (mode !== 'point') return
    update((node) => node.addPoint({ id: makePointId(), x, y }))
  }

  function handlePointClick(id: string) {
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
      checkPlot(expr) // validate before storing
      update((node) => node.addFunction(expr))
      setFnDraft('')
      setFnError(null)
    } catch (err) {
      // Invalid expression: keep the draft so it can be fixed, and say why.
      setFnError(err instanceof Error ? err.message : 'Not a valid expression')
    }
  }

  // Live typeset preview of what is being typed (empty/invalid draft: nothing).
  // Parametric curves are shown as typed (the y = f(x) typeset preview does not fit them).
  const draftHtml = useMemo(() => {
    const latex = fnDraft.trim() && !isParametric(fnDraft) ? plotToLatex(fnDraft) : null
    return latex ? katex.renderToString(latex, { throwOnError: false, output: 'html' }) : null
  }, [fnDraft])

  const curves = useMemo(() => functions.map((expr, i) => {
    const color = FN_COLORS[i % FN_COLORS.length]
    const parametric = isParametric(expr)
    try {
      checkPlot(expr)
      const latex = parametric ? null : plotToLatex(expr)
      const html = latex ? katex.renderToString(latex, { throwOnError: false, output: 'html' }) : null
      return { expr, color, parametric, html, error: null as string | null }
    } catch (err) {
      return { expr, color, parametric, html: null, error: String(err instanceof Error ? err.message : err) }
    }
  }), [functions])

  return (
    <div className="graph-block" contentEditable={false} ref={rootRef} onClick={() => { if (!readOnly) setEditing(true) }}>
      {editing && <div className="graph-toolbar">
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
      </div>}

      <Suspense fallback={<div className="graph-board graph-loading" />}>
        <GraphBoard
          points={points}
          edges={edges}
          functions={functions}
          colors={FN_COLORS}
          editing={editing}
          selected={selected}
          onBackgroundClick={handleBackgroundClick}
          onPointClick={handlePointClick}
          onPointMoved={(id, x, y) => update((node) => node.movePoint(id, x, y))}
          onEnterEdit={() => { if (!readOnly) setEditing(true) }}
        />
      </Suspense>

      <div className="graph-functions">
        {curves.map((c, i) => (
          <div key={i} className="graph-fn-item">
            <span className="graph-fn-swatch" style={{ background: c.color }} />
            {c.html
              ? <span className="graph-fn-expr graph-fn-math" dangerouslySetInnerHTML={{ __html: c.html }} />
              : c.parametric
                ? <span className="graph-fn-expr">{c.expr}</span>
                : <span className="graph-fn-expr">y = {c.expr}</span>}
            {c.error && <span className="graph-fn-error" title={c.error}>invalid</span>}
            {editing && <button type="button" className="graph-fn-remove" onClick={() => update((node) => node.removeFunction(i))}>×</button>}
          </div>
        ))}
        {editing && <div className="graph-fn-add">
          {!isParametric(fnDraft) && <span className="graph-fn-add-prefix">y =</span>}
          <input
            className="graph-fn-input"
            placeholder="x^2 + 1   or   x(t) = cos(t), y(t) = sin(t), t from 0 to 2*pi"
            value={fnDraft}
            onChange={e => { setFnDraft(e.target.value); setFnError(null) }}
            onKeyDown={e => { if (e.key === 'Enter') addFunction() }}
          />
          <button type="button" className="graph-fn-add-btn" onClick={addFunction}>Plot</button>
        </div>}
        {editing && draftHtml && <div className="graph-fn-preview" dangerouslySetInnerHTML={{ __html: draftHtml }} />}
        {editing && fnError && <div className="graph-fn-error-msg" role="alert">{fnError}</div>}
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

  movePoint(id: string, x: number, y: number): void {
    const self = this.getWritable()
    self.__points = self.__points.map(p => (p.id === id ? { ...p, x, y } : p))
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
