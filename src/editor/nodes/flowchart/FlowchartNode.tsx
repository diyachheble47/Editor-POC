// FlowchartNode — a flowchart block on React Flow (already used by the circuit
// block, so no new dependency). Steps are nodes (oval start/end, box process,
// diamond decision, slanted input/output), arrows are edges and may carry a
// label such as "Yes" / "No". The graph lives on the Lexical node as plain
// data. Click the chart to edit; zoom and pan work only while editing.

import { DecoratorNode } from 'lexical'
import type {
  EditorConfig, LexicalEditor, LexicalNode, NodeKey, SerializedLexicalNode, Spread,
} from 'lexical'
import { lazy, Suspense } from 'react'
import type { ReactElement } from 'react'
import type { Node, Edge } from '@xyflow/react'

export type FlowKind = 'start' | 'end' | 'process' | 'decision' | 'io'
export type FlowStep = Node<{ text: string }>
export type FlowArrow = Edge

export type SerializedFlowchartNode = Spread<
  { steps: FlowStep[]; arrows: FlowArrow[] },
  SerializedLexicalNode
>

const FlowchartComponent = lazy(() => import('./FlowchartView'))

export class FlowchartNode extends DecoratorNode<ReactElement> {
  __steps: FlowStep[]
  __arrows: FlowArrow[]

  static getType(): string { return 'flowchart' }
  static clone(node: FlowchartNode): FlowchartNode { return new FlowchartNode(node.__steps, node.__arrows, node.__key) }

  constructor(steps: FlowStep[] = [], arrows: FlowArrow[] = [], key?: NodeKey) {
    super(key)
    this.__steps = steps
    this.__arrows = arrows
  }

  exportJSON(): SerializedFlowchartNode {
    return { type: 'flowchart', version: 1, steps: this.__steps, arrows: this.__arrows }
  }
  static importJSON(s: SerializedFlowchartNode): FlowchartNode { return new FlowchartNode(s.steps, s.arrows) }

  setGraph(steps: FlowStep[], arrows: FlowArrow[]): void {
    const self = this.getWritable()
    self.__steps = steps
    self.__arrows = arrows
  }

  isInline(): boolean { return false }
  createDOM(_config: EditorConfig): HTMLElement { return document.createElement('div') }
  updateDOM(): boolean { return false }
  decorate(_editor: LexicalEditor, _config: EditorConfig): ReactElement {
    return (
      <Suspense fallback={<div className="flow-block flow-loading" />}>
        <FlowchartComponent nodeKey={this.getKey()} steps={this.__steps} arrows={this.__arrows} />
      </Suspense>
    )
  }
}

export function $createFlowchartNode(steps?: FlowStep[], arrows?: FlowArrow[]): FlowchartNode {
  return new FlowchartNode(steps, arrows)
}
export function $isFlowchartNode(node: LexicalNode | null | undefined): node is FlowchartNode {
  return node instanceof FlowchartNode
}

/**
 * Top-down layered layout for AI-built flowcharts. Layers follow the shortest
 * path from the first step; steps in a layer sit side by side, centred.
 * Arrows going to an earlier or same layer (loops) leave and enter by the side.
 */
export function buildFlowchart(
  list: { id: string; kind: FlowKind; text: string }[],
  links: [string, string, string?][],
): { steps: FlowStep[]; arrows: FlowArrow[] } {
  const out = new Map(list.map(n => [n.id, [] as string[]]))
  for (const [a, b] of links) out.get(a)?.push(b)
  const depth = new Map<string, number>()
  if (list.length) {
    depth.set(list[0].id, 0)
    const queue = [list[0].id]
    while (queue.length) {
      const cur = queue.shift()!
      for (const n of out.get(cur) ?? []) if (!depth.has(n)) { depth.set(n, depth.get(cur)! + 1); queue.push(n) }
    }
  }
  const maxDepth = Math.max(0, ...depth.values())
  const layers = new Map<number, string[]>()
  for (const n of list) {
    const d = depth.get(n.id) ?? maxDepth + 1
    depth.set(n.id, d)
    layers.set(d, [...(layers.get(d) ?? []), n.id])
  }
  const X = 190, Y = 100
  const pos = new Map<string, { x: number; y: number }>()
  for (const [d, ids] of layers) ids.forEach((id, i) => pos.set(id, { x: (i - (ids.length - 1) / 2) * X + 260, y: 20 + d * Y }))

  const steps: FlowStep[] = list.map(n => ({ id: n.id, type: n.kind, position: pos.get(n.id)!, data: { text: n.text } }))
  const arrows: FlowArrow[] = links.map(([a, b, label], i) => {
    const forward = depth.get(b)! > depth.get(a)!
    const dx = pos.get(b)!.x - pos.get(a)!.x
    return {
      id: `e${i}`, source: a, target: b,
      sourceHandle: forward ? (dx > 40 ? 'r' : dx < -40 ? 'l' : 'b') : 'r',
      targetHandle: forward ? (Math.abs(dx) > 40 ? 't' : 't') : 'r',
      ...(label ? { label } : {}),
    }
  })
  return { steps, arrows }
}
