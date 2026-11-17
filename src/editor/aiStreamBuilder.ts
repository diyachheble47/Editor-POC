import {
  $createParagraphNode, $createTextNode, $getNodeByKey, $getRoot, $isElementNode,
} from 'lexical'
import type { ElementNode, LexicalEditor, LexicalNode, NodeKey } from 'lexical'
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text'
import { $createListItemNode, $createListNode } from '@lexical/list'
import { $createCodeNode } from '@lexical/code-core'
import { $createTableNodeWithDimensions } from '@lexical/table'
import { $createHorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode'
import { $createEquationNode } from './nodes/EquationNode'
import { $createCalloutNode } from './nodes/callout'
import { SpreadsheetNode } from './nodes/spreadsheet/SpreadsheetNode'
import { GraphNode } from './nodes/graph/GraphNode'
import { GeometryNode } from './nodes/geometry/GeometryNode'
import type { GeoEdge } from './nodes/geometry/GeometryNode'
import { MoleculeNode } from './nodes/molecule/MoleculeNode'
import { CircuitNode } from './nodes/circuit/CircuitNode'
import { ChartNode } from './nodes/chart/ChartNode'
import { FlowchartNode, buildFlowchart } from './nodes/flowchart/FlowchartNode'
import type { CircuitPart, CircuitWire } from './nodes/circuit/CircuitNode'
import { defaultValue } from './nodes/circuit/symbols'
import type { PartType } from './nodes/circuit/symbols'
import { makePointId } from './nodes/_shared/plane'
import { moleculeFromName } from './aiMolecules'
import type { AiBlock, AiEvent } from '../storage/api'

/** Points keyed by coordinate, so a shared corner becomes one point. */
function pointRegistry() {
  const byKey = new Map<string, { id: string; x: number; y: number }>()
  return {
    id(x: number, y: number): string {
      const key = `${x},${y}`
      let point = byKey.get(key)
      if (!point) {
        point = { id: makePointId(), x, y }
        byKey.set(key, point)
      }
      return point.id
    },
    all: () => [...byKey.values()],
  }
}

// Lays the circuit out so it reads like a schematic. A single closed loop
// (each part wired to exactly two others) becomes a rectangle: parts across the
// top left-to-right, back along the bottom right-to-left, with the wires that
// turn the corners looping round the sides. Anything with branches is layered
// left to right from the first part.
const GAP_X = 150
const ROW_Y = [40, 190]

function circuitFrom(block: Extract<AiBlock, { type: 'circuit' }>): CircuitNode {
  const ids = block.parts.map(p => p.id)
  const typeOf = new Map(block.parts.map(p => [p.id, p.type]))
  const handle = (id: string, side: 'a' | 'b') => (typeOf.get(id) === 'ground' ? 'a' : side)
  const adj = new Map(ids.map(id => [id, [] as string[]]))
  for (const [x, y] of block.wires) { adj.get(x)?.push(y); adj.get(y)?.push(x) }

  // Cycle order, if the wires form one simple loop through every part.
  let cycle: string[] | null = null
  if (ids.length >= 3 && ids.every(id => adj.get(id)!.length === 2 && new Set(adj.get(id)).size === 2)) {
    const order = [ids[0]]
    let prev = '', cur = ids[0]
    for (;;) {
      const next = adj.get(cur)!.find(n => n !== prev) ?? adj.get(cur)![0]
      if (next === ids[0]) break
      if (order.includes(next)) { order.length = 0; break }
      order.push(next); prev = cur; cur = next
    }
    if (order.length === ids.length && Math.ceil(order.length / 2) <= 5) cycle = order
  }

  const pos = new Map<string, { x: number; y: number }>()
  const wires: CircuitWire[] = []
  const wire = (from: string, fromSide: 'a' | 'b', to: string, toSide: 'a' | 'b') =>
    wires.push({ id: `w${wires.length}`, source: from, target: to, sourceHandle: handle(from, fromSide), targetHandle: handle(to, toSide) })

  if (cycle) {
    const top = Math.ceil(cycle.length / 2)
    // The bottom row spans the same width as the top, so the side wires are vertical.
    const bottom = cycle.length - top
    const rightX = 40 + (top - 1) * GAP_X
    cycle.forEach((id, i) => {
      if (i < top) pos.set(id, { x: 40 + i * GAP_X, y: ROW_Y[0] })
      else {
        const j = i - top
        pos.set(id, { x: bottom === 1 ? rightX : rightX - (j * (rightX - 40)) / (bottom - 1), y: ROW_Y[1] })
      }
    })
    cycle.forEach((id, i) => {
      const next = cycle![(i + 1) % cycle!.length]
      const row = (k: number) => (k < top ? 0 : 1)
      const r1 = row(i), r2 = row((i + 1) % cycle!.length)
      if (r1 === 0 && r2 === 0) wire(id, 'b', next, 'a')        // along the top
      else if (r1 === 0 && r2 === 1) wire(id, 'b', next, 'b')   // down the right side
      else if (r1 === 1 && r2 === 1) wire(id, 'a', next, 'b')   // back along the bottom
      else wire(id, 'a', next, 'a')                             // up the left side
    })
  } else {
    // Breadth-first layers from the first part; parts in a layer stack vertically.
    const depth = new Map<string, number>([[ids[0], 0]])
    const queue = [ids[0]]
    while (queue.length) {
      const cur = queue.shift()!
      for (const n of adj.get(cur) ?? []) if (!depth.has(n)) { depth.set(n, depth.get(cur)! + 1); queue.push(n) }
    }
    const maxDepth = Math.max(0, ...depth.values())
    const used = new Map<number, number>()
    for (const id of ids) {
      const d = depth.get(id) ?? maxDepth + 1
      const row = used.get(d) ?? 0
      used.set(d, row + 1)
      pos.set(id, { x: 40 + d * GAP_X, y: 40 + row * 110 })
    }
    for (const [from, to] of block.wires) {
      const dx = pos.get(to)!.x - pos.get(from)!.x
      if (dx > 0) wire(from, 'b', to, 'a')
      else if (dx < 0) wire(from, 'a', to, 'b')
      else wire(from, 'b', to, 'b')
    }
  }

  const parts: CircuitPart[] = block.parts.map(p => ({
    id: p.id,
    type: p.type,
    position: pos.get(p.id)!,
    data: { value: p.value ?? defaultValue(p.type as PartType), closed: p.closed === true },
  }))
  return new CircuitNode(parts, wires)
}

/**
 * Builds AI-generated blocks at the end of the editor as events arrive:
 * headings and paragraphs are opened empty and typed into, the rest
 * (lists, equations, callouts) appear whole. The server has already
 * checked every block; anything that still can't be created is skipped.
 */
export function createAiStreamBuilder(editor: LexicalEditor) {
  let openKey: NodeKey | null = null
  let skipped = 0

  function $create(block: AiBlock): LexicalNode {
    switch (block.type) {
      case 'heading': return $createHeadingNode(`h${block.level}`)
      case 'paragraph': return $createParagraphNode()
      case 'list': {
        const list = $createListNode(block.ordered ? 'number' : 'bullet')
        for (const item of block.items) list.append($createListItemNode().append($createTextNode(item)))
        return list
      }
      case 'equation': return $createEquationNode(block.value)
      case 'callout': return $createCalloutNode(block.variant, block.text)
      case 'quote': return $createQuoteNode().append($createTextNode(block.text))
      case 'divider': return $createHorizontalRuleNode()
      case 'code': return $createCodeNode(block.language).append($createTextNode(block.text))
      case 'table': return new SpreadsheetNode(block.rows)
      case 'matrix': {
        const table = $createTableNodeWithDimensions(block.rows.length, block.rows[0].length, false)
        block.rows.forEach((row, r) => row.forEach((cell, c) => {
          const paragraph = (table.getChildAtIndex(r) as ElementNode | null)?.getChildAtIndex<ElementNode>(c)?.getFirstChild()
          if (cell && $isElementNode(paragraph)) paragraph.append($createTextNode(cell))
        }))
        return table
      }
      case 'graph': {
        const pts = pointRegistry()
        const ids = block.points.map(([x, y]) => pts.id(x, y))
        const edges: [string, string][] = block.connect ? ids.slice(1).map((id, i) => [ids[i], id]) : []
        return new GraphNode(pts.all(), edges, block.functions)
      }
      case 'geometry': {
        const pts = pointRegistry()
        const polygons = block.polygons.map(poly => poly.map(([x, y]) => pts.id(x, y)))
        const edges: GeoEdge[] = block.segments.map(([a, b]) => ({ a: pts.id(a[0], a[1]), b: pts.id(b[0], b[1]), kind: 'segment' }))
        return new GeometryNode(pts.all(), edges, [], polygons)
      }
      case 'molecule': {
        // Drawn from SMILES: the block lays itself out when it mounts (SmilesDrawer loads on demand).
        if (block.smiles) return new MoleculeNode([], [], undefined, block.smiles)
        const molecule = moleculeFromName(block.name ?? '')
        if (!molecule) throw new Error(`unknown molecule ${block.name}`)
        return new MoleculeNode(molecule.atoms, molecule.bonds)
      }
      case 'circuit': return circuitFrom(block)
      case 'flowchart': {
        const g = buildFlowchart(block.nodes, block.edges)
        return new FlowchartNode(g.steps, g.arrows)
      }
      case 'chart': return new ChartNode({ title: block.title, chartType: block.chartType, labels: block.labels, series: block.series })
    }
  }

  return {
    get skipped() { return skipped },
    apply(event: AiEvent) {
      if (event.t === 'close') { openKey = null; return }
      if (event.t !== 'open' && event.t !== 'block' && event.t !== 'text') return
      editor.update(() => {
        try {
          if (event.t === 'text') {
            const parent = openKey ? $getNodeByKey(openKey) : null
            if ($isElementNode(parent)) parent.append($createTextNode(event.text))
            return
          }
          const node = $create(event.block)
          $getRoot().append(node)
          openKey = event.t === 'open' ? node.getKey() : null
        } catch {
          skipped++
          openKey = null
        }
      }, { discrete: true })
    },
    /** Leaves an empty paragraph after the content to keep typing in. */
    finish() {
      editor.update(() => {
        const last = $getRoot().getLastChild()
        if (!$isElementNode(last) || last.getType() !== 'paragraph' || !last.isEmpty()) {
          $getRoot().append($createParagraphNode())
        }
      }, { discrete: true })
    },
  }
}
