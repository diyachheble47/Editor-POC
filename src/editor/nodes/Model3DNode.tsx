// This is a custom Lexical node for the "3D Model" block.
//
// Lexical concept: Lexical lets you create your own node types by
// extending one of its base classes. For content that needs custom
// rendering (not just text), Lexical provides `DecoratorNode`. A
// DecoratorNode stores plain data (here: the model's file data and name)
// inside the Lexical document tree, and hands off the actual visual
// rendering to a React component via `decorate()`.
//
// This is the important proof for this milestone: the 3D model is not
// just some HTML dropped into the page. It is a real node living inside
// the Lexical EditorState, right next to paragraphs and headings. If you
// select all and copy, or serialize the document to JSON, the 3D model
// block travels with it like any other block.

import { $getNodeByKey, DecoratorNode } from 'lexical'
import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import { useEffect, useRef } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import '@google/model-viewer'

// model-viewer's own zero-config "auto" framing turned out to be
// unreliable in testing — it looked right for a moment after load, then
// drifted to a different, zoomed-in, cropped position a few seconds
// later. `updateFraming()` is model-viewer's own official method for
// this exact problem — it directly recomputes the ideal field-of-view
// and camera distance from the model's real geometry (their tested
// logic, not ours), and unlike the automatic behavior, it only runs
// when we call it — once, right after load — so there's nothing left
// to drift afterward.
interface ModelViewerElement extends HTMLElement {
  updateFraming(): Promise<void>
  jumpCameraToGoal(): void
}

function frameModelSafely(el: ModelViewerElement) {
  el.updateFraming().then(() => el.jumpCameraToGoal())
}

// This is the "serialized" shape of the node — what it looks like when
// Lexical turns the document into plain JSON (e.g. to save it).
// `src` holds the .glb file itself encoded as a base64 data URL, so the
// model travels inside the document, with no backend/file server needed.
export type SerializedModel3DNode = Spread<
  {
    src: string
    fileName: string
  },
  SerializedLexicalNode
>

function Model3DComponent({
  nodeKey,
  src,
  fileName,
}: {
  nodeKey: NodeKey
  src: string
  fileName: string
}) {
  const [editor] = useLexicalComposerContext()
  const viewerRef = useRef<ModelViewerElement>(null)

  // model-viewer fires a native "load" event once the model file has
  // actually finished loading and its real dimensions are known — only
  // then can we compute a camera distance guaranteed to fit it.
  useEffect(() => {
    const el = viewerRef.current
    if (!el) return
    function onLoad() {
      if (viewerRef.current) frameModelSafely(viewerRef.current)
    }
    el.addEventListener('load', onLoad)
    return () => el.removeEventListener('load', onLoad)
  }, [src])

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      // Lexical concept: to change a node's data, we run editor.update()
      // and call a setter method on the node. Lexical then re-renders
      // wherever that node appears.
      editor.update(() => {
        const node = $getModel3DNodeByKey(nodeKey)
        node?.setModel(dataUrl, file.name)
      })
    }
    reader.readAsDataURL(file)
  }

  if (!src) {
    return (
      <div className="model3d-block model3d-empty">
        <p>Choose a .glb 3D model file to display it here.</p>
        <input type="file" accept=".glb,.gltf" onChange={handleFileChange} />
      </div>
    )
  }

  return (
    <div className="model3d-block">
      <div className="model3d-viewport">
        <model-viewer
          ref={viewerRef as React.Ref<HTMLElement>}
          src={src}
          alt={fileName}
          camera-controls
          interaction-prompt="none"
          style={{ width: '100%', height: '100%', background: '#111' }}
        />
      </div>
      <div className="model3d-filename">{fileName}</div>
    </div>
  )
}

function $getModel3DNodeByKey(nodeKey: NodeKey): Model3DNode | null {
  const node = $getNodeByKey(nodeKey)
  return node instanceof Model3DNode ? node : null
}

export class Model3DNode extends DecoratorNode<React.ReactElement> {
  __src: string
  __fileName: string

  static getType(): string {
    return 'model3d'
  }

  static clone(node: Model3DNode): Model3DNode {
    return new Model3DNode(node.__src, node.__fileName, node.__key)
  }

  constructor(src: string = '', fileName: string = '', key?: NodeKey) {
    super(key)
    this.__src = src
    this.__fileName = fileName
  }

  // Lexical concept: exportJSON/importJSON define how this node is
  // converted to/from plain JSON. This is what makes the 3D model block
  // part of the document's serialized state, not a side effect outside it.
  exportJSON(): SerializedModel3DNode {
    return {
      type: 'model3d',
      version: 1,
      src: this.__src,
      fileName: this.__fileName,
    }
  }

  static importJSON(serializedNode: SerializedModel3DNode): Model3DNode {
    return new Model3DNode(serializedNode.src, serializedNode.fileName)
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-lexical-model3d', this.__fileName)
    return { element }
  }

  static importDOM(): DOMConversionMap | null {
    return null
  }

  setModel(src: string, fileName: string): void {
    const writable = this.getWritable()
    writable.__src = src
    writable.__fileName = fileName
  }

  // Lexical concept: createDOM makes the plain wrapper element that lives
  // in the real DOM. The actual visual content is provided by decorate().
  createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    return div
  }

  updateDOM(): boolean {
    return false
  }

  // Lexical concept: decorate() is what makes DecoratorNode special —
  // instead of Lexical rendering DOM itself, it hands control to React
  // here. This is how a rich, interactive 3D viewer can live inside a
  // Lexical document.
  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement {
    return (
      <Model3DComponent
        nodeKey={this.getKey()}
        src={this.__src}
        fileName={this.__fileName}
      />
    )
  }
}

export function $createModel3DNode(): Model3DNode {
  return new Model3DNode()
}

export function $isModel3DNode(
  node: LexicalNode | null | undefined,
): node is Model3DNode {
  return node instanceof Model3DNode
}
