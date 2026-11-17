// CircuitNode — an electric circuit block. The canvas is React Flow: parts are
// nodes, wires are edges. The graph lives on the Lexical node as plain data
// (nodes + edges) so it saves and undoes with the rest of the document. The
// canvas itself (CircuitView.tsx) is loaded on demand.

import { DecoratorNode } from 'lexical'
import type {
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import { lazy, Suspense } from 'react'
import type { ReactElement } from 'react'
import type { Node, Edge } from '@xyflow/react'

export type CircuitNodeData = { value?: string; closed?: boolean }
export type CircuitPart = Node<CircuitNodeData>
export type CircuitWire = Edge

export type SerializedCircuitNode = Spread<
  { parts: CircuitPart[]; wires: CircuitWire[] },
  SerializedLexicalNode
>

const CircuitComponent = lazy(() => import('./CircuitView'))

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
      <Suspense fallback={<div className="circuit-block circuit-loading" />}>
        <CircuitComponent
          nodeKey={this.getKey()}
          parts={this.__parts}
          wires={this.__wires}
        />
      </Suspense>
    )
  }
}

export function $createCircuitNode(): CircuitNode {
  return new CircuitNode()
}

export function $isCircuitNode(node: LexicalNode | null | undefined): node is CircuitNode {
  return node instanceof CircuitNode
}
