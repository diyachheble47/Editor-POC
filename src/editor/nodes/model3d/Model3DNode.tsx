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
import { Model3DViewer } from './Model3DViewer'

export type Model3DDisplayMode = 'inline' | 'fullwidth'

export interface Model3DAnimationConfig {
  autoRotate: boolean
  rotationSpeed: number
}

export interface Model3DDisplayConfig {
  mode: Model3DDisplayMode
  height: number
}

export type SerializedModel3DNode = Spread<
  {
    modelId: string
    modelUrl: string
    fileName: string
    scale: number
    animation: Model3DAnimationConfig
    display: Model3DDisplayConfig
  },
  SerializedLexicalNode
>

export class Model3DNode extends DecoratorNode<ReactElement> {
  __modelId: string
  __modelUrl: string
  __fileName: string
  __scale: number
  __animation: Model3DAnimationConfig
  __display: Model3DDisplayConfig

  static getType(): string {
    return 'model3d-v2'
  }

  static clone(node: Model3DNode): Model3DNode {
    return new Model3DNode(
      node.__modelId,
      node.__modelUrl,
      node.__fileName,
      node.__scale,
      node.__animation,
      node.__display,
      node.__key,
    )
  }

  constructor(
    modelId: string,
    modelUrl: string = '',
    fileName: string = '',
    scale: number = 1,
    animation: Model3DAnimationConfig = { autoRotate: false, rotationSpeed: 2 },
    display: Model3DDisplayConfig = { mode: 'inline', height: 320 },
    key?: NodeKey,
  ) {
    super(key)
    this.__modelId = modelId
    this.__modelUrl = modelUrl
    this.__fileName = fileName
    this.__scale = scale
    this.__animation = animation
    this.__display = display
  }

  exportJSON(): SerializedModel3DNode {
    return {
      type: 'model3d-v2',
      version: 1,
      modelId: this.__modelId,
      modelUrl: this.__modelUrl,
      fileName: this.__fileName,
      scale: this.__scale,
      animation: { ...this.__animation },
      display: { ...this.__display },
    }
  }

  static importJSON(s: SerializedModel3DNode): Model3DNode {
    return new Model3DNode(s.modelId, s.modelUrl, s.fileName, s.scale, s.animation, s.display)
  }

  exportDOM(): DOMExportOutput {
    const el = document.createElement('div')
    el.setAttribute('data-model3d-id', this.__modelId)
    el.setAttribute('data-model3d-file', this.__fileName)
    return { element: el }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    div.className = 'model3d-wrapper'
    return div
  }

  updateDOM(): boolean {
    return false
  }

  setModel(modelUrl: string, fileName: string): void {
    const w = this.getWritable()
    w.__modelUrl = modelUrl
    w.__fileName = fileName
  }

  setScale(scale: number): void {
    this.getWritable().__scale = scale
  }

  setAnimation(patch: Partial<Model3DAnimationConfig>): void {
    const w = this.getWritable()
    w.__animation = { ...w.__animation, ...patch }
  }

  setDisplay(patch: Partial<Model3DDisplayConfig>): void {
    const w = this.getWritable()
    w.__display = { ...w.__display, ...patch }
  }

  getModelId(): string { return this.__modelId }
  getModelUrl(): string { return this.__modelUrl }
  getFileName(): string { return this.__fileName }
  getScale(): number { return this.__scale }
  getAnimation(): Model3DAnimationConfig { return this.__animation }
  getDisplay(): Model3DDisplayConfig { return this.__display }

  decorate(_editor: LexicalEditor, _config: EditorConfig): ReactElement {
    return createElement(Model3DViewer, {
      nodeKey: this.getKey(),
      modelUrl: this.__modelUrl,
      fileName: this.__fileName,
      scale: this.__scale,
      animation: this.__animation,
      display: this.__display,
    })
  }
}

export function $createModel3DNode(): Model3DNode {
  return new Model3DNode(crypto.randomUUID())
}

export function $isModel3DNode(node: LexicalNode | null | undefined): node is Model3DNode {
  return node instanceof Model3DNode
}

export function $getModel3DNodeByKey(key: NodeKey): Model3DNode | null {
  const node = $getNodeByKey(key)
  return node instanceof Model3DNode ? node : null
}
