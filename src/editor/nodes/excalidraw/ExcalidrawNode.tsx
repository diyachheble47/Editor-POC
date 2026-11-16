import { DecoratorNode, $getNodeByKey } from 'lexical'
import type {
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import type { ReactElement } from 'react'
import { createElement } from 'react'
import { ExcalidrawViewer } from './ExcalidrawViewer'

export type SerializedExcalidrawNode = Spread<
  {
    drawingId: string
    elements: unknown[]
    appState: Record<string, unknown>
    title: string
  },
  SerializedLexicalNode
>

export class ExcalidrawNode extends DecoratorNode<ReactElement> {
  __drawingId: string
  __elements: unknown[]
  __appState: Record<string, unknown>
  __title: string

  static getType(): string {
    return 'excalidraw-v1'
  }

  static clone(node: ExcalidrawNode): ExcalidrawNode {
    return new ExcalidrawNode(
      node.__drawingId,
      node.__elements,
      node.__appState,
      node.__title,
      node.__key,
    )
  }

  constructor(
    drawingId: string,
    elements: unknown[] = [],
    appState: Record<string, unknown> = {},
    title: string = 'Drawing',
    key?: NodeKey,
  ) {
    super(key)
    this.__drawingId = drawingId
    this.__elements = elements
    this.__appState = appState
    this.__title = title
  }

  exportJSON(): SerializedExcalidrawNode {
    return {
      type: 'excalidraw-v1',
      version: 1,
      drawingId: this.__drawingId,
      elements: this.__elements,
      appState: this.__appState,
      title: this.__title,
    }
  }

  static importJSON(s: SerializedExcalidrawNode): ExcalidrawNode {
    return new ExcalidrawNode(s.drawingId, s.elements, s.appState, s.title)
  }

  exportDOM(): DOMExportOutput {
    const el = document.createElement('div')
    el.setAttribute('data-excalidraw-id', this.__drawingId)
    el.setAttribute('data-excalidraw-title', this.__title)
    return { element: el }
  }

  // Block-level: the default (true) makes Lexical wrap this in a paragraph.
  isInline(): boolean {
    return false
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    div.className = 'excalidraw-wrapper'
    return div
  }

  updateDOM(): boolean {
    return false
  }

  setDrawing(elements: unknown[], appState: Record<string, unknown>): void {
    const w = this.getWritable()
    w.__elements = elements
    w.__appState = appState
  }

  setTitle(title: string): void {
    this.getWritable().__title = title
  }

  getDrawingId(): string { return this.__drawingId }
  getElements(): unknown[] { return this.__elements }
  getAppState(): Record<string, unknown> { return this.__appState }
  getTitle(): string { return this.__title }

  decorate(_editor: LexicalEditor, _config: EditorConfig): ReactElement {
    return createElement(ExcalidrawViewer, {
      nodeKey: this.getKey(),
      drawingId: this.__drawingId,
      elements: this.__elements,
      appState: this.__appState,
      title: this.__title,
    })
  }
}

export function $createExcalidrawNode(): ExcalidrawNode {
  return new ExcalidrawNode(crypto.randomUUID())
}

export function $isExcalidrawNode(node: LexicalNode | null | undefined): node is ExcalidrawNode {
  return node instanceof ExcalidrawNode
}

export function $getExcalidrawNodeByKey(key: NodeKey): ExcalidrawNode | null {
  const node = $getNodeByKey(key)
  return node instanceof ExcalidrawNode ? node : null
}
