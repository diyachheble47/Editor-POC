import { describe, expect, it } from 'vitest'
import { createEditor, $getRoot } from 'lexical'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { CodeNode } from '@lexical/code-core'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode'
import { SpreadsheetNode } from './nodes/spreadsheet/SpreadsheetNode'
import { GraphNode } from './nodes/graph/GraphNode'
import { GeometryNode } from './nodes/geometry/GeometryNode'
import { MoleculeNode } from './nodes/molecule/MoleculeNode'
import { CircuitNode } from './nodes/circuit/CircuitNode'
import { ChartNode } from './nodes/chart/ChartNode'
import { MathNode } from './nodes/math/MathNode'
import { FlowchartNode } from './nodes/flowchart/FlowchartNode'
import { ListItemNode, ListNode } from '@lexical/list'
import { EquationNode } from './nodes/EquationNode'
import { CalloutNode } from './nodes/callout'
import { createAiStreamBuilder } from './aiStreamBuilder'
import type { AiEvent } from '../storage/api'

function run(events: AiEvent[], finish = false) {
  const editor = createEditor({
    nodes: [
      HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, HorizontalRuleNode, EquationNode, CalloutNode,
      TableNode, TableRowNode, TableCellNode, SpreadsheetNode, GraphNode, GeometryNode, MoleculeNode, CircuitNode,
      ChartNode, FlowchartNode, MathNode,
    ],
    onError: e => { throw e },
  })
  const builder = createAiStreamBuilder(editor)
  events.forEach(e => builder.apply(e))
  if (finish) builder.finish()
  const blocks = editor.getEditorState().read(() =>
    $getRoot().getChildren().map(c => ({ type: c.getType(), text: c.getTextContent() })),
  )
  return { blocks, skipped: builder.skipped }
}

describe('createAiStreamBuilder', () => {
  it('types headings and paragraphs, and drops lists, equations and callouts in whole', () => {
    const { blocks } = run([
      { t: 'start' },
      { t: 'open', block: { type: 'heading', level: 1 } },
      { t: 'text', text: 'Aci' }, { t: 'text', text: 'ds' }, { t: 'close' },
      { t: 'open', block: { type: 'paragraph' } }, { t: 'text', text: 'Sour.' }, { t: 'close' },
      { t: 'block', block: { type: 'list', ordered: true, items: ['one', 'two'] } },
      { t: 'block', block: { type: 'equation', value: 'HCl -> H+ + Cl-' } },
      { t: 'block', block: { type: 'callout', variant: 'tip', text: 'pH 7 is neutral' } },
      { t: 'done', blocks: 5 },
    ])
    expect(blocks.map(b => b.type)).toEqual(['heading', 'paragraph', 'list', 'equation', 'callout'])
    expect(blocks[0].text).toBe('Acids')
    expect(blocks[1].text).toBe('Sour.')
    expect(blocks[2].text).toContain('one')
    expect(blocks[2].text).toContain('two')
  })

  it('does not put text from one block into the next', () => {
    const { blocks } = run([
      { t: 'open', block: { type: 'paragraph' } }, { t: 'text', text: 'first' }, { t: 'close' },
      { t: 'block', block: { type: 'equation', value: 'x' } },
      { t: 'text', text: 'stray' },
    ])
    expect(blocks[0].text).toBe('first')
    expect(blocks.some(b => b.text === 'stray')).toBe(false)
  })

  it('finish() leaves one empty paragraph to keep typing in', () => {
    const { blocks } = run([{ t: 'block', block: { type: 'equation', value: 'x' } }], true)
    expect(blocks.at(-1)).toEqual({ type: 'paragraph', text: '' })
  })

  it('builds every STEM block from the AI\'s plain data', () => {
    const { blocks, skipped } = run([
      { t: 'block', block: { type: 'table', rows: [['a', 'b'], ['1', '=A2+1']] } },
      { t: 'block', block: { type: 'matrix', rows: [['1', '0'], ['0', '1']] } },
      { t: 'block', block: { type: 'graph', functions: ['x^2'], points: [[1, 1], [2, 4]], connect: true } },
      { t: 'block', block: { type: 'geometry', polygons: [[[0, 0], [4, 0], [0, 3]]], segments: [[[0, 0], [2, 2]]] } },
      { t: 'block', block: { type: 'molecule', name: 'ethanol' } },
      {
        t: 'block',
        block: {
          type: 'circuit',
          parts: [{ id: 'b1', type: 'battery' }, { id: 'r1', type: 'resistor', value: '50 Ω' }, { id: 'g', type: 'ground' }],
          wires: [['b1', 'r1'], ['r1', 'g']],
        },
      },
      { t: 'block', block: { type: 'quote', text: 'q' } },
      { t: 'block', block: { type: 'divider' } },
      { t: 'block', block: { type: 'code', language: 'python', text: 'print(1)' } },
    ])
    expect(skipped).toBe(0)
    expect(blocks.map(b => b.type)).toEqual([
      'spreadsheet', 'table', 'graph', 'geometry', 'molecule', 'circuit', 'quote', 'horizontalrule', 'code',
    ])
    expect(blocks[1].text).toContain('1')
  })

  it('lays a series circuit out as a closed rectangle', () => {
    const editor = createEditor({ nodes: [CircuitNode], onError: e => { throw e } })
    const builder = createAiStreamBuilder(editor)
    builder.apply({ t: 'block', block: {
      type: 'circuit',
      parts: [
        { id: 'b', type: 'battery' }, { id: 's', type: 'switch' }, { id: 'l', type: 'bulb' },
        { id: 'r', type: 'resistor' },
      ],
      wires: [['b', 's'], ['s', 'l'], ['l', 'r'], ['r', 'b']],
    } })
    const node = editor.getEditorState().read(() => $getRoot().getChildren().find(n => n instanceof CircuitNode)) as CircuitNode
    const at = Object.fromEntries(node.__parts.map(p => [p.id, p.position]))
    // top row: b, s ; bottom row (right to left): l, r
    expect(at.b.y).toBe(at.s.y)
    expect(at.l.y).toBe(at.r.y)
    expect(at.l.y).toBeGreaterThan(at.b.y)
    expect(at.l.x).toBeGreaterThan(at.r.x)
    expect(node.__wires).toHaveLength(4)
    expect(node.__wires.every(w => at[w.source] && at[w.target])).toBe(true)
  })

  it('builds a chart and a flowchart', () => {
    const { blocks, skipped } = run([
      { t: 'block', block: { type: 'chart', chartType: 'pie', title: 'Share', labels: ['a', 'b'], series: [{ name: 's', values: [1, 3] }] } },
      {
        t: 'block',
        block: {
          type: 'flowchart',
          nodes: [
            { id: 's', kind: 'start', text: 'Start' }, { id: 'd', kind: 'decision', text: 'Ok?' },
            { id: 'a', kind: 'process', text: 'Do it' }, { id: 'e', kind: 'end', text: 'End' },
          ],
          edges: [['s', 'd'], ['d', 'a', 'Yes'], ['d', 'e', 'No'], ['a', 'e']],
        },
      },
    ])
    expect(skipped).toBe(0)
    expect(blocks.map(b => b.type)).toEqual(['chart', 'flowchart'])
  })

  it('puts a maths formula in a Math block and a reaction in a chemical equation', () => {
    const { blocks } = run([
      { t: 'block', block: { type: 'math', latex: 'V = I \\times R' } },
      { t: 'block', block: { type: 'equation', value: '2H2 + O2 -> 2H2O' } },
    ])
    expect(blocks.map(b => b.type)).toEqual(['math', 'equation'])
  })

  it('counts a block it cannot build instead of crashing', () => {
    const { blocks, skipped } = run([
      { t: 'block', block: { type: 'molecule', name: 'unobtainium' } },
      { t: 'block', block: { type: 'quote', text: 'still here' } },
    ])
    expect(skipped).toBe(1)
    expect(blocks.map(b => b.type)).toEqual(['quote'])
  })
})
