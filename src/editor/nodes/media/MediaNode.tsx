// MediaNode — the block behind the slash menu's Media section: an uploaded
// image, video or audio file, a YouTube / Vimeo link, or any embeddable page
// (iframe).
//
// Plain Lexical DecoratorNode. Images and embeds use native <img>/<iframe>;
// video and audio play in the Video.js player (MediaPlayer, loaded lazily).
// Uploaded files live in this browser's IndexedDB (assetStore) and the document
// keeps only an `idb-asset:<id>` reference. Links are stored as the https URL.
// Everything loads lazily, only once the block scrolls into view.

import { DecoratorNode, $getNodeByKey } from 'lexical'
import type {
  EditorConfig, LexicalEditor, LexicalNode, NodeKey, SerializedLexicalNode, Spread,
} from 'lexical'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ResizeFrame } from '../_shared/ResizeFrame'
import { useAssetUrl } from '../image/ImageNode'
import { parseEmbed, isSafeEmbedSrc } from './mediaUrl'
import { pickAndStoreMedia } from './mediaFiles'

const MediaPlayer = lazy(() => import('./MediaPlayer'))

export type MediaKind = 'image' | 'video' | 'audio' | 'youtube' | 'embed'

export type SerializedMediaNode = Spread<
  { kind: MediaKind; src: string; alt: string; width: number },
  SerializedLexicalNode
>

const DEFAULT_WIDTH = 560

/** Becomes true once the element is near the viewport and stays true. */
function useNearViewport(): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect() } }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [near])
  return [ref, near]
}

type Picked = { kind: MediaKind; src: string; alt: string }

/** Small one-line "paste a link" pill for YouTube / Embed blocks. */
function LinkBar({ mode, onChoose, onCancel }: {
  mode: 'youtube' | 'embed'; onChoose: (p: Picked) => void; onCancel?: () => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const parsed = parseEmbed(value)
    if (!parsed) { setError(mode === 'embed' ? 'Paste an https link or <iframe> code' : 'Paste a valid https link'); return }
    if (mode === 'youtube' && parsed.kind !== 'youtube' && parsed.kind !== 'vimeo') {
      setError('That is not a YouTube / Vimeo link'); return
    }
    onChoose({ kind: parsed.kind === 'video' ? 'video' : parsed.kind === 'embed' ? 'embed' : 'youtube', src: parsed.src, alt: '' })
  }

  return (
    <div className="media-bar" onPointerDown={e => e.stopPropagation()}>
      <span className="media-bar-icon">{mode === 'youtube' ? '▶' : '</>'}</span>
      <input
        className="media-bar-input"
        autoFocus
        value={value}
        placeholder={mode === 'youtube' ? 'Paste a YouTube or Vimeo link…' : 'Paste a link or <iframe> code…'}
        onChange={e => { setValue(e.target.value); setError(null) }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } else if (e.key === 'Escape') onCancel?.() }}
      />
      <button type="button" className="media-bar-btn" onClick={submit} disabled={!value.trim()}>Embed</button>
      {onCancel && <button type="button" className="media-bar-x" onClick={onCancel} title="Cancel">×</button>}
      {error && <span className="media-bar-error">{error}</span>}
    </div>
  )
}

function Content({ kind, src, alt }: { kind: MediaKind; src: string; alt: string }) {
  const [ref, near] = useNearViewport()
  const playable = kind === 'video' || kind === 'audio'
  const assetUrl = useAssetUrl(near && (kind === 'image' || playable) ? src : '')
  if (kind === 'image') {
    return <div ref={ref}>{assetUrl ? <img src={assetUrl} alt={alt} draggable={false} /> : <div className="img-loading" />}</div>
  }
  if (playable) {
    // The data attributes let the HTML / PDF export find the original file: the player's own
    // markup is dropped from an export, and only exists once the block has scrolled into view.
    return (
      <div
        ref={ref}
        className={`media-player media-player-${kind}`}
        data-media-kind={kind}
        data-media-src={src}
        data-media-name={alt}
        onPointerDown={e => e.stopPropagation()}
      >
        {assetUrl
          ? <Suspense fallback={<div className="img-loading" />}><MediaPlayer kind={kind} src={assetUrl} /></Suspense>
          : <div className="img-loading" />}
      </div>
    )
  }
  return (
    <div ref={ref} className="media-embed">
      {near && isSafeEmbedSrc(src) && (
        <iframe
          src={src}
          title={alt || (kind === 'youtube' ? 'Video' : 'Embedded content')}
          loading="lazy"
          allow="fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-forms"
        />
      )}
    </div>
  )
}

function MediaComponent({
  nodeKey, kind, src, alt, width,
}: { nodeKey: NodeKey; kind: MediaKind; src: string; alt: string; width: number }) {
  const [editor] = useLexicalComposerContext()
  const [replacing, setReplacing] = useState(false)

  function update(fn: (n: MediaNode) => void) {
    editor.update(() => {
      const n = $getNodeByKey(nodeKey)
      if (n instanceof MediaNode) fn(n)
    })
  }

  function choose(p: Picked) {
    update(n => n.setMedia(p.kind, p.src, p.alt))
    setReplacing(false)
  }

  function replace() {
    if (kind === 'image' || kind === 'video' || kind === 'audio') {
      void pickAndStoreMedia(kind).then(p => { if (p) choose(p) }).catch(() => {})
    } else setReplacing(true)
  }

  if (!src || replacing) {
    const mode = kind === 'embed' ? 'embed' : 'youtube'
    return (
      <div className="img-block" contentEditable={false}>
        <LinkBar mode={mode} onChoose={choose} onCancel={src ? () => setReplacing(false) : undefined} />
      </div>
    )
  }

  return (
    <div className="img-block" contentEditable={false}>
      <ResizeFrame width={width} min={160} onCommit={w => update(n => n.setWidth(w))}>
        <Content kind={kind} src={src} alt={alt} />
        <button type="button" className="img-replace" onClick={replace}>Replace</button>
      </ResizeFrame>
    </div>
  )
}

export class MediaNode extends DecoratorNode<React.ReactElement> {
  __kind: MediaKind
  __src: string
  __alt: string
  __width: number

  static getType(): string { return 'media' }

  static clone(node: MediaNode): MediaNode {
    return new MediaNode(node.__kind, node.__src, node.__alt, node.__width, node.__key)
  }

  constructor(kind: MediaKind = 'image', src = '', alt = '', width = DEFAULT_WIDTH, key?: NodeKey) {
    super(key)
    this.__kind = kind
    this.__src = src
    this.__alt = alt
    this.__width = width
  }

  exportJSON(): SerializedMediaNode {
    return { type: 'media', version: 1, kind: this.__kind, src: this.__src, alt: this.__alt, width: this.__width }
  }

  static importJSON(s: SerializedMediaNode): MediaNode {
    // A saved link is re-checked: anything that is not https is dropped.
    const link = s.kind === 'youtube' || s.kind === 'embed'
    const src = link && !isSafeEmbedSrc(s.src) ? '' : s.src
    return new MediaNode(s.kind, src, s.alt, s.width)
  }

  setMedia(kind: MediaKind, src: string, alt: string): void {
    const self = this.getWritable()
    self.__kind = kind
    self.__src = src
    self.__alt = alt
  }

  setWidth(width: number): void { this.getWritable().__width = width }

  isInline(): boolean { return false }
  createDOM(_config: EditorConfig): HTMLElement { return document.createElement('div') }
  updateDOM(): boolean { return false }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement {
    return <MediaComponent nodeKey={this.getKey()} kind={this.__kind} src={this.__src} alt={this.__alt} width={this.__width} />
  }
}

export function $createMediaNode(kind: MediaKind = 'youtube', src = '', alt = ''): MediaNode {
  return new MediaNode(kind, src, alt)
}

export function $isMediaNode(node: LexicalNode | null | undefined): node is MediaNode {
  return node instanceof MediaNode
}
