// ImageNode — an uploaded picture. The bytes live in this browser's IndexedDB
// (same assetStore as 3D models); the document only holds a short
// `idb-asset:<id>` reference, so saved documents stay small and the orphan
// cleanup scan (which greps for that prefix) knows the file is in use.
//
// A freshly inserted block shows an upload panel (drop / choose / paste a
// file, or pick from images already uploaded in this browser). Once an image
// is chosen the panel is replaced by the picture itself, resizable by dragging
// its corner handle.

import { DecoratorNode, $getNodeByKey } from 'lexical'
import type {
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import { useEffect, useRef, useState } from 'react'
import { ResizeFrame } from '../_shared/ResizeFrame'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  saveAsset, getAsset, listAssetIds, assetUrlFor, assetIdFromUrl, isAssetUrl,
} from '../../assetStore'

const ID_PREFIX = 'img-'
const DEFAULT_WIDTH = 480
const MIN_WIDTH = 80
const MAX_WIDTH = 1200
const MAX_BYTES = 15 * 1024 * 1024
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'

export type SerializedImageNode = Spread<
  { src: string; alt: string; width: number },
  SerializedLexicalNode
>

/** Opens the browser's file picker straight away; resolves null on cancel. */
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ACCEPT
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/** Validates and stores a picked file; resolves the asset reference + name. */
export async function storeImageFile(file: File): Promise<{ src: string; alt: string } | null> {
  if (!file.type.startsWith('image/') || file.size > MAX_BYTES) return null
  const id = newImageId()
  await saveAsset(id, file)
  return { src: assetUrlFor(id), alt: file.name.replace(/\.[^.]+$/, '') }
}

function newImageId(): string {
  return ID_PREFIX + crypto.randomUUID()
}

/** Object URL for a stored blob; revoked when the component unmounts. */
export function useAssetUrl(src: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!src) { setUrl(null); return }
    if (!isAssetUrl(src)) { setUrl(src); return } // plain/data URL
    let revoked = false
    let objectUrl: string | null = null
    getAsset(assetIdFromUrl(src)).then((blob) => {
      if (revoked || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch(() => {})
    return () => { revoked = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [src])
  return url
}

export function Thumb({ id, onPick }: { id: string; onPick: () => void }) {
  const url = useAssetUrl(assetUrlFor(id))
  return (
    <button type="button" className="img-thumb" onClick={onPick} title="Use this image">
      {url && <img src={url} alt="" draggable={false} />}
    </button>
  )
}

function UploadPanel({ onChoose }: { onChoose: (file: File | string) => void }) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listAssetIds()
      .then((ids) => setRecent(ids.filter((id) => id.startsWith(ID_PREFIX)).slice(-24).reverse()))
      .catch(() => {})
  }, [])

  function handleFiles(files: FileList | null | undefined) {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('That file is not an image.'); return }
    if (file.size > MAX_BYTES) { setError('Image is larger than 15 MB.'); return }
    setError(null)
    onChoose(file)
  }

  return (
    <div
      className={`img-panel${dragOver ? ' drag-over' : ''}`}
      tabIndex={0}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
      onPaste={(e) => handleFiles(e.clipboardData.files)}
    >
      <div className="img-panel-title">Add an image</div>
      <div className="img-panel-drop">
        <span className="img-panel-icon">🖼</span>
        <span>Drag &amp; drop, paste, or</span>
        <button type="button" className="img-panel-btn" onClick={() => inputRef.current?.click()}>
          Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
        <span className="img-panel-hint">PNG, JPEG, WebP, GIF, SVG · up to 15 MB</span>
      </div>
      {error && <div className="img-panel-error">{error}</div>}
      {recent.length > 0 && (
        <>
          <div className="img-panel-sub">Your uploads</div>
          <div className="img-thumbs">
            {recent.map((id) => <Thumb key={id} id={id} onPick={() => onChoose(assetUrlFor(id))} />)}
          </div>
        </>
      )}
    </div>
  )
}

function ImageComponent({
  nodeKey, src, alt, width,
}: { nodeKey: NodeKey; src: string; alt: string; width: number }) {
  const [editor] = useLexicalComposerContext()
  const url = useAssetUrl(src)

  function update(fn: (node: ImageNode) => void) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof ImageNode) fn(node)
    })
  }

  function choose(pick: File | string) {
    if (typeof pick === 'string') { update((n) => n.setSrc(pick, '')); return }
    const id = newImageId()
    saveAsset(id, pick)
      .then(() => update((n) => n.setSrc(assetUrlFor(id), pick.name.replace(/\.[^.]+$/, ''))))
      .catch(() => {})
  }

  if (!src) {
    return <div className="img-block" contentEditable={false}><UploadPanel onChoose={choose} /></div>
  }

  return (
    <div className="img-block" contentEditable={false}>
      <ResizeFrame width={width} min={MIN_WIDTH} max={MAX_WIDTH} onCommit={(w) => update((n) => n.setWidth(w))}>
        {url ? <img src={url} alt={alt} draggable={false} /> : <div className="img-loading" />}
        <button type="button" className="img-replace" onClick={() => {
          void pickImageFile().then(f => f && choose(f))
        }}>
          Replace
        </button>
      </ResizeFrame>
    </div>
  )
}

export class ImageNode extends DecoratorNode<React.ReactElement> {
  __src: string
  __alt: string
  __width: number

  static getType(): string { return 'image' }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__alt, node.__width, node.__key)
  }

  constructor(src = '', alt = '', width = DEFAULT_WIDTH, key?: NodeKey) {
    super(key)
    this.__src = src
    this.__alt = alt
    this.__width = width
  }

  exportJSON(): SerializedImageNode {
    return { type: 'image', version: 1, src: this.__src, alt: this.__alt, width: this.__width }
  }

  static importJSON(s: SerializedImageNode): ImageNode {
    return new ImageNode(s.src, s.alt, s.width)
  }

  setSrc(src: string, alt: string): void {
    const self = this.getWritable()
    self.__src = src
    self.__alt = alt
  }

  setWidth(width: number): void {
    this.getWritable().__width = width
  }

  isInline(): boolean { return false }

  createDOM(_config: EditorConfig): HTMLElement { return document.createElement('div') }

  updateDOM(): boolean { return false }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement {
    return <ImageComponent nodeKey={this.getKey()} src={this.__src} alt={this.__alt} width={this.__width} />
  }
}

export function $createImageNode(src = '', alt = ''): ImageNode { return new ImageNode(src, alt) }

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode
}
