// CircuitNode — an electric circuit block. The canvas is React Flow: parts are
// nodes, wires are edges. The graph lives on the Lexical node as plain data
// (nodes + edges) so it saves and undoes with the rest of the document.

import { DecoratorNode, $getNodeByKey } from 'lexical'
import type {
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Handle,
  Position,
  ConnectionMode,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react'
import type { Node, Edge, Connection, NodeChange, EdgeChange, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { PartSymbol, PART_LABELS, PART_TYPES, defaultValue } from './symbols'
import type { PartType } from './symbols'

export type CircuitNodeData = { value?: string; closed?: boolean }
export type CircuitPart = Node<CircuitNodeData>
export type CircuitWire = Edge

export type SerializedCircuitNode = Spread<
  { parts: CircuitPart[]; wires: CircuitWire[] },
  SerializedLexicalNode
>

const CircuitActionsContext = createContext<{ toggleSwitch: (id: string) => void }>({
  toggleSwitch: () => {},
})

function PartNodeView({ id, type, data }: NodeProps<CircuitPart>) {
  const { toggleSwitch } = useContext(CircuitActionsContext)
  const partType = (type ?? 'resistor') as PartType
  const isGround = partType === 'ground'
  return (
    <div
      className="circuit-part"
      onDoubleClick={partType === 'switch' ? () => toggleSwitch(id) : undefined}
      title={partType === 'switch' ? 'Double-click to open/close' : undefined}
    >
      {isGround ? (
        <Handle type="source" id="a" position={Position.Top} />
      ) : (
        <>
          <Handle type="source" id="a" position={Position.Left} />
          <Handle type="source" id="b" position={Position.Right} />
        </>
      )}
      <PartSymbol type={partType} closed={!!data.closed} />
      {!isGround && (
        <div className="circuit-part-label">
          {partType === 'switch' ? (data.closed ? 'Closed' : 'Open') : (data.value ?? defaultValue(partType))}
        </div>
      )}
    </div>
  )
}

const NODE_TYPES = Object.fromEntries(PART_TYPES.map(t => [t, PartNodeView]))

function toPersistable(nodes: CircuitPart[]): CircuitPart[] {
  return nodes.map(({ id, type, position, data }) => ({ id, type, position, data }))
}

function toPersistableWires(edges: CircuitWire[]): CircuitWire[] {
  return edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({
    id, source, target, sourceHandle, targetHandle,
  }))
}

function CircuitCanvas({
  nodeKey,
  initialParts,
  initialWires,
}: {
  nodeKey: NodeKey
  initialParts: CircuitPart[]
  initialWires: CircuitWire[]
}) {
  const [editor] = useLexicalComposerContext()
  const [parts, setParts] = useState<CircuitPart[]>(initialParts)
  const [wires, setWires] = useState<CircuitWire[]>(initialWires)

  // Undo/redo and remote updates replace the Lexical-side graph; mirror them.
  useEffect(() => { setParts(initialParts) }, [initialParts])
  useEffect(() => { setWires(initialWires) }, [initialWires])

  const persist = useCallback((nextParts: CircuitPart[], nextWires: CircuitWire[]) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isCircuitNode(node)) node.setGraph(toPersistable(nextParts), toPersistableWires(nextWires))
    })
  }, [editor, nodeKey])

  function handleNodesChange(changes: NodeChange<CircuitPart>[]) {
    setParts(prev => {
      const next = applyNodeChanges(changes, prev)
      if (changes.some(c => c.type === 'remove')) {
        persist(next, wires)
      }
      return next
    })
  }

  function handleEdgesChange(changes: EdgeChange<CircuitWire>[]) {
    setWires(prev => {
      const next = applyEdgeChanges(changes, prev)
      if (changes.some(c => c.type === 'remove')) persist(parts, next)
      return next
    })
  }

  function handleConnect(connection: Connection) {
    const next = addEdge(connection, wires)
    setWires(next)
    persist(parts, next)
  }

  function handleDragStop() {
    persist(parts, wires)
  }

  // Stops here so Lexical never sees keys typed on the canvas. That also
  // blocks React Flow's own document-level Delete handler, so deletion of
  // selected parts and wires is done here instead.
  function handleCanvasKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation()
    if (e.key !== 'Delete' && e.key !== 'Backspace') return
    // A selected wire wins over selected parts: a part can stay "selected" in
    // React Flow after a drag even when the user has since clicked a wire.
    const selectedWires = wires.filter(w => w.selected).map(w => w.id)
    const removedWires = new Set(selectedWires)
    const removedParts = new Set(selectedWires.length > 0 ? [] : parts.filter(p => p.selected).map(p => p.id))
    if (removedParts.size === 0 && removedWires.size === 0) return
    e.preventDefault()
    const nextParts = parts.filter(p => !removedParts.has(p.id))
    const nextWires = wires.filter(w =>
      !removedWires.has(w.id) && !removedParts.has(w.source) && !removedParts.has(w.target),
    )
    setParts(nextParts)
    setWires(nextWires)
    persist(nextParts, nextWires)
  }

  function addPart(type: PartType) {
    const id = crypto.randomUUID()
    // First free slot on a 4-column grid, so a new part never lands on top of
    // an existing one (even after parts were moved or deleted).
    let slot = 0
    const isTaken = (s: number) => parts.some(p =>
      Math.abs(p.position.x - (40 + (s % 4) * 180)) < 90 && Math.abs(p.position.y - (40 + Math.floor(s / 4) * 120)) < 60,
    )
    while (isTaken(slot)) slot++
    const next: CircuitPart[] = [
      ...parts,
      {
        id,
        type,
        position: { x: 40 + (slot % 4) * 180, y: 40 + Math.floor(slot / 4) * 120 },
        data: { value: defaultValue(type), closed: false },
      },
    ]
    setParts(next)
    persist(next, wires)
  }

  const toggleSwitch = useCallback((id: string) => {
    setParts(prev => {
      const next = prev.map(p => (p.id === id ? { ...p, data: { ...p.data, closed: !p.data.closed } } : p))
      persist(next, wires)
      return next
    })
  }, [persist, wires])

  return (
    <CircuitActionsContext.Provider value={{ toggleSwitch }}>
      <div className="circuit-block" contentEditable={false} onKeyDown={handleCanvasKeyDown}>
        <div className="circuit-palette">
          {PART_TYPES.map(type => (
            <button
              key={type}
              type="button"
              className="circuit-palette-btn"
              onClick={() => addPart(type)}
            >
              + {PART_LABELS[type]}
            </button>
          ))}
          <span className="circuit-palette-hint">
            Drag from a dot to a dot to wire. Select a wire or part and press Delete to remove it.
          </span>
        </div>
        <div className="circuit-canvas">
          <ReactFlow
            nodes={parts}
            edges={wires}
            nodeTypes={NODE_TYPES}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onNodeDragStop={handleDragStop}
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={null}
            snapToGrid
            snapGrid={[12, 12]}
            fitView={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={12} size={1} />
          </ReactFlow>
        </div>
      </div>
    </CircuitActionsContext.Provider>
  )
}

function CircuitComponent(props: {
  nodeKey: NodeKey
  parts: CircuitPart[]
  wires: CircuitWire[]
}) {
  return (
    <ReactFlowProvider>
      <CircuitCanvas
        nodeKey={props.nodeKey}
        initialParts={props.parts}
        initialWires={props.wires}
      />
    </ReactFlowProvider>
  )
}

export class CircuitNode extends DecoratorNode<ReactElement> {
  __parts: CircuitPart[]
  __wires: CircuitWire[]

  static getType(): string {
    return 'circuit'
  }

  static clone(node: CircuitNode): CircuitNode {
    return new CircuitNode(node.__parts, node.__wires, node.__key)
  }

  constructor(parts: CircuitPart[] = [], wires: CircuitWire[] = [], key?: NodeKey) {
    super(key)
    this.__parts = parts
    this.__wires = wires
  }

  exportJSON(): SerializedCircuitNode {
    return {
      type: 'circuit',
      version: 1,
      parts: this.__parts,
      wires: this.__wires,
    }
  }

  static importJSON(s: SerializedCircuitNode): CircuitNode {
    return new CircuitNode(s.parts, s.wires)
  }

  setGraph(parts: CircuitPart[], wires: CircuitWire[]): void {
    const self = this.getWritable()
    self.__parts = parts
    self.__wires = wires
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

  decorate(_editor: LexicalEditor, _config: EditorConfig): ReactElement {
    return (
      <CircuitComponent
        nodeKey={this.getKey()}
        parts={this.__parts}
        wires={this.__wires}
      />
    )
  }
}

export function $createCircuitNode(): CircuitNode {
  return new CircuitNode()
}

export function $isCircuitNode(node: LexicalNode | null | undefined): node is CircuitNode {
  return node instanceof CircuitNode
}
