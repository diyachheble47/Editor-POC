// The React Flow canvas for the flowchart block, loaded on demand so React Flow
// is only downloaded when a document contains a flowchart.
import { $getNodeByKey } from 'lexical'
import type { NodeKey } from 'lexical'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  ReactFlow, ReactFlowProvider, Background, Handle, Position, ConnectionMode, MarkerType,
  addEdge, applyNodeChanges, applyEdgeChanges,
} from '@xyflow/react'
import type { Connection, NodeChange, EdgeChange, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { FlowchartNode } from './FlowchartNode'
import type { FlowKind, FlowStep, FlowArrow } from './FlowchartNode'

const KIND_LABEL: Record<FlowKind, string> = {
  start: 'Start', end: 'End', process: 'Process', decision: 'Decision', io: 'Input / Output',
}
const KINDS = Object.keys(KIND_LABEL) as FlowKind[]
const DEFAULT_TEXT: Record<FlowKind, string> = {
  start: 'Start', end: 'End', process: 'Step', decision: 'Condition?', io: 'Input / output',
}

const EditCtx = createContext<{ editing: boolean; setText: (id: string, text: string) => void }>({
  editing: false, setText: () => {},
})

function StepView({ id, type, data }: NodeProps<FlowStep>) {
  const { editing, setText } = useContext(EditCtx)
  const kind = (type ?? 'process') as FlowKind
  return (
    <div className={`flow-step flow-${kind}`}>
      <Handle type="source" id="t" position={Position.Top} />
      <Handle type="source" id="l" position={Position.Left} />
      <Handle type="source" id="r" position={Position.Right} />
      <Handle type="source" id="b" position={Position.Bottom} />
      {kind === 'decision' && (
        <svg className="flow-diamond" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon points="50,2 98,50 50,98 2,50" />
        </svg>
      )}
      {editing ? (
        <input
          className="flow-step-input nodrag"
          value={data.text}
          maxLength={60}
          onChange={e => setText(id, e.target.value)}
          onKeyDown={e => e.stopPropagation()}
          aria-label="Step text"
        />
      ) : (
        <span className="flow-step-text">{data.text}</span>
      )}
    </div>
  )
}

const NODE_TYPES = Object.fromEntries(KINDS.map(k => [k, StepView]))

const persistSteps = (n: FlowStep[]): FlowStep[] => n.map(({ id, type, position, data }) => ({ id, type, position, data }))
const persistArrows = (e: FlowArrow[]): FlowArrow[] =>
  e.map(({ id, source, target, sourceHandle, targetHandle, label }) => ({ id, source, target, sourceHandle, targetHandle, ...(label ? { label } : {}) }))

function FlowCanvas({ nodeKey, initialSteps, initialArrows }: { nodeKey: NodeKey; initialSteps: FlowStep[]; initialArrows: FlowArrow[] }) {
  const [editor] = useLexicalComposerContext()
  const [steps, setSteps] = useState<FlowStep[]>(initialSteps)
  const [arrows, setArrows] = useState<FlowArrow[]>(initialArrows)
  const [editing, setEditing] = useState(initialSteps.length === 0)
  const rootRef = useRef<HTMLDivElement>(null)

  // Undo/redo replace the Lexical-side graph; keep React Flow's measured sizes.
  useEffect(() => {
    setSteps(prev => initialSteps.map(p => {
      const old = prev.find(o => o.id === p.id)
      return old?.measured ? { ...p, measured: old.measured } : p
    }))
  }, [initialSteps])
  useEffect(() => { setArrows(initialArrows) }, [initialArrows])

  useEffect(() => {
    if (!editing) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as globalThis.Node)) setEditing(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [editing])

  const persist = useCallback((s: FlowStep[], a: FlowArrow[]) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof FlowchartNode) node.setGraph(persistSteps(s), persistArrows(a))
    })
  }, [editor, nodeKey])

  const setText = useCallback((id: string, text: string) => {
    setSteps(prev => {
      const next = prev.map(s => (s.id === id ? { ...s, data: { text } } : s))
      persist(next, arrows)
      return next
    })
  }, [persist, arrows])

  function onNodesChange(changes: NodeChange<FlowStep>[]) {
    setSteps(prev => {
      const next = applyNodeChanges(changes, prev)
      if (changes.some(c => c.type === 'remove')) persist(next, arrows)
      return next
    })
  }
  function onEdgesChange(changes: EdgeChange<FlowArrow>[]) {
    setArrows(prev => {
      const next = applyEdgeChanges(changes, prev)
      if (changes.some(c => c.type === 'remove')) persist(steps, next)
      return next
    })
  }
  function onConnect(c: Connection) {
    const next = addEdge({ ...c, markerEnd: { type: MarkerType.ArrowClosed } }, arrows)
    setArrows(next)
    persist(steps, next)
  }

  function addStep(kind: FlowKind) {
    let slot = 0
    const at = (s: number) => ({ x: 120 + (s % 3) * 200, y: 30 + Math.floor(s / 3) * 110 })
    while (steps.some(p => Math.abs(p.position.x - at(slot).x) < 80 && Math.abs(p.position.y - at(slot).y) < 50)) slot++
    const next: FlowStep[] = [...steps, { id: crypto.randomUUID(), type: kind, position: at(slot), data: { text: DEFAULT_TEXT[kind] } }]
    setSteps(next)
    persist(next, arrows)
  }

  const selectedArrow = arrows.find(a => a.selected)
  function setArrowLabel(label: string) {
    if (!selectedArrow) return
    const next = arrows.map(a => (a.id === selectedArrow.id ? { ...a, label } : a))
    setArrows(next)
    persist(steps, next)
  }

  // Keys typed on the canvas must not reach Lexical; deletion is handled here.
  function onKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation()
    if (e.key !== 'Delete' && e.key !== 'Backspace') return
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const selArrows = new Set(arrows.filter(a => a.selected).map(a => a.id))
    const selSteps = new Set(selArrows.size ? [] : steps.filter(s => s.selected).map(s => s.id))
    if (!selArrows.size && !selSteps.size) return
    e.preventDefault()
    const nextSteps = steps.filter(s => !selSteps.has(s.id))
    const nextArrows = arrows.filter(a => !selArrows.has(a.id) && !selSteps.has(a.source) && !selSteps.has(a.target))
    setSteps(nextSteps); setArrows(nextArrows); persist(nextSteps, nextArrows)
  }

  return (
    <EditCtx.Provider value={{ editing, setText }}>
      <div
        ref={rootRef}
        className={`flow-block${editing ? ' flow-editing' : ''}`}
        contentEditable={false}
        onKeyDown={onKeyDown}
        onClick={() => { if (!editing) setEditing(true) }}
      >
        {editing && (
          <div className="graph-toolbar">
            {KINDS.map(k => (
              <button key={k} type="button" className="circuit-palette-btn" onClick={() => addStep(k)}>+ {KIND_LABEL[k]}</button>
            ))}
            {selectedArrow ? (
              <input
                className="flow-label-input"
                placeholder="Arrow label (e.g. Yes)"
                value={typeof selectedArrow.label === 'string' ? selectedArrow.label : ''}
                maxLength={20}
                onChange={e => setArrowLabel(e.target.value)}
                onKeyDown={e => e.stopPropagation()}
              />
            ) : (
              <span className="circuit-palette-hint">Drag from a dot to a dot to connect. Click an arrow to label it. Select and press Delete to remove.</span>
            )}
          </div>
        )}
        <div className="flow-canvas">
          <ReactFlow
            nodes={steps}
            edges={arrows}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={() => persist(steps, arrows)}
            connectionMode={ConnectionMode.Loose}
            defaultEdgeOptions={{ type: 'step', markerEnd: { type: MarkerType.ArrowClosed } }}
            deleteKeyCode={null}
            zoomOnScroll={editing}
            zoomOnPinch={editing}
            zoomOnDoubleClick={editing}
            panOnDrag={editing}
            preventScrolling={editing}
            nodesDraggable={editing}
            nodesConnectable={editing}
            elementsSelectable={editing}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
            proOptions={{ hideAttribution: true }}
          >
            {editing && <Background gap={16} size={1} />}
          </ReactFlow>
        </div>
      </div>
    </EditCtx.Provider>
  )
}

export default function FlowchartComponent(props: { nodeKey: NodeKey; steps: FlowStep[]; arrows: FlowArrow[] }) {
  return (
    <ReactFlowProvider>
      <FlowCanvas nodeKey={props.nodeKey} initialSteps={props.steps} initialArrows={props.arrows} />
    </ReactFlowProvider>
  )
}

