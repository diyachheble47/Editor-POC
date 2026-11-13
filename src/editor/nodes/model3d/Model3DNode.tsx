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

export type Model3DDisplayMode = 'inline' | 'fullwidth' | 'float-left' | 'float-right'

export interface Model3DAnimationConfig {
  autoRotate: boolean
  rotationSpeed: number
}

export interface Model3DDisplayConfig {
  mode: Model3DDisplayMode
  height: number
  // Only used when mode is float-left/float-right — how wide the model
  // sits in the page so paragraph text can wrap around it on the other side.
  widthPercent: number
}

// The user's last orbit/zoom/pan position. Without this, every rebuild of the
// Three.js scene — which happens each time the block scrolls out of view and
// back (the viewer tears itself down to save memory/GPU) — reset the camera
// to the auto-fit default, so any framing the user set never stuck.
export interface Model3DCamera {
  pos: [number, number, number]
  target: [number, number, number]
}

// Applied directly to the node's own wrapper <div> (not the React-rendered
// content inside it) — CSS float only pulls surrounding *sibling* paragraphs
// into the wrap, and this wrapper is what actually sits next to them in the
// document flow.
function applyFloatStyle(dom: HTMLElement, display: Model3DDisplayConfig): void {
  if (display.mode === 'float-left' || display.mode === 'float-right') {
    dom.style.float = display.mode === 'float-left' ? 'left' : 'right'
    dom.style.width = `${display.widthPercent}%`
    dom.style.margin = display.mode === 'float-left' ? '4px 16px 8px 0' : '4px 0 8px 16px'
  } else {
    dom.style.float = 'none'
    dom.style.width = ''
    dom.style.margin = ''
  }
}

export type SerializedModel3DNode = Spread<
  {
    modelId: string
    modelUrl: string
    fileName: string
    scale: number
    animation: Model3DAnimationConfig
    display: Model3DDisplayConfig
    camera?: Model3DCamera
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
  __camera?: Model3DCamera

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
      node.__camera,
      node.__key,
    )
  }

  constructor(
    modelId: string,
    modelUrl: string = '',
    fileName: string = '',
    scale: number = 1,
    animation: Model3DAnimationConfig = { autoRotate: false, rotationSpeed: 2 },
    display: Model3DDisplayConfig = { mode: 'inline', height: 320, widthPercent: 45 },
    camera?: Model3DCamera,
    key?: NodeKey,
  ) {
    super(key)
    this.__modelId = modelId
    this.__modelUrl = modelUrl
    this.__fileName = fileName
    this.__scale = scale
    this.__animation = animation
    this.__display = display
    this.__camera = camera
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
      ...(this.__camera ? { camera: { pos: [...this.__camera.pos], target: [...this.__camera.target] } } : {}),
    }
  }

  static importJSON(s: SerializedModel3DNode): Model3DNode {
    const display: Model3DDisplayConfig = { ...s.display, widthPercent: s.display.widthPercent ?? 45 }
    return new Model3DNode(s.modelId, s.modelUrl, s.fileName, s.scale, s.animation, display, s.camera)
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
    applyFloatStyle(div, this.__display)
    return div
  }

  updateDOM(prevNode: Model3DNode, dom: HTMLElement): boolean {
    if (prevNode.__display.mode !== this.__display.mode || prevNode.__display.widthPercent !== this.__display.widthPercent) {
      applyFloatStyle(dom, this.__display)
    }
    return false
  }

  setModel(modelUrl: string, fileName: string): void {
    const w = this.getWritable()
    w.__modelUrl = modelUrl
    w.__fileName = fileName
    // A different model has different geometry — the old framing almost
    // certainly no longer makes sense, so fall back to auto-fit again.
    w.__camera = undefined
  }

  setCamera(camera: Model3DCamera): void {
    this.getWritable().__camera = camera
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
  getCamera(): Model3DCamera | undefined { return this.__camera }

  decorate(_editor: LexicalEditor, _config: EditorConfig): ReactElement {
    return createElement(Model3DViewer, {
      nodeKey: this.getKey(),
      modelId: this.__modelId,
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
