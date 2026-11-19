import { useRef, useState, lazy, Suspense, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import type { NodeKey } from 'lexical'
import { $getExcalidrawNodeByKey } from './ExcalidrawNode'
import { useTheme } from '../../../context/ThemeContext'
import '@excalidraw/excalidraw/index.css'

const Excalidraw = lazy(() =>
  import('@excalidraw/excalidraw').then(m => ({ default: m.Excalidraw }))
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawAPI = any

interface Props {
  nodeKey: NodeKey
  drawingId: string
  elements: unknown[]
  appState: Record<string, unknown>
  title: string
}

export function ExcalidrawViewer({ nodeKey, elements, appState, title }: Props) {
  const [editor] = useLexicalComposerContext()
  const { theme } = useTheme()
  // Read-only hosts (the document Preview) set the whole editor non-editable
  // rather than this one block — Excalidraw's own toolbar, selection handles
  // and "click to draw" affordance otherwise show regardless, since none of
  // that is gated by Lexical's `editable` flag on its own.
  const isEditable = editor.isEditable()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const inlineAPIRef = useRef<ExcalidrawAPI | null>(null)
  const fullscreenAPIRef = useRef<ExcalidrawAPI | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blockRef = useRef<HTMLDivElement>(null)

  // Deactivate the canvas when the user clicks outside it — same pattern as
  // the 3D model block, so the drawing can sit inline with text without its
  // header bar / fullscreen button always taking up space, and so scrolling
  // past it doesn't get captured by Excalidraw's own wheel-zoom/pan.
  useEffect(() => {
    if (!isActive) return
    function onPointerDown(e: PointerEvent) {
      if (!blockRef.current?.contains(e.target as Node)) {
        setIsActive(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [isActive])

  // Debounced save from inline canvas
  function scheduleInlineSave(api: ExcalidrawAPI) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const els = api.getSceneElements()
      const state = api.getAppState()
      editor.update(() => {
        const node = $getExcalidrawNodeByKey(nodeKey)
        if (node) node.setDrawing(els as unknown[], state as Record<string, unknown>)
      })
    }, 800)
  }

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }, [])

  function saveFromFullscreen() {
    const api = fullscreenAPIRef.current
    if (!api) { setIsFullscreen(false); return }
    const els = api.getSceneElements()
    const state = api.getAppState()
    editor.update(() => {
      const node = $getExcalidrawNodeByKey(nodeKey)
      if (node) node.setDrawing(els as unknown[], state as Record<string, unknown>)
    })
    setIsFullscreen(false)
  }

  // Shared initialData — use fresh reference when elements change
  const initialData = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    elements: elements as any,
    appState: {
      ...appState,
      collaborators: new Map(),
      // Transparent, not white — otherwise the canvas paints a solid white
      // rectangle regardless of the block's own border/background CSS, so
      // "borderless" mode still looks like a box sitting on the page
      // instead of actually blending in (same reasoning as the 3D model's
      // always-transparent WebGL background).
      viewBackgroundColor: 'transparent',
    },
  }

  // Loaded and not being interacted with: drop the header bar so the drawing
  // can sit inline with text, just like the 3D model block does. Read-only
  // is always borderless — there's no editing to switch into.
  const borderless = !isActive || !isEditable

  return (
    <div
      ref={blockRef}
      className={`excalidraw-block${borderless ? ' excalidraw-borderless' : ''}`}
      contentEditable={false}
    >
      {/* Header bar */}
      {!borderless && (
        <div className="excalidraw-bar">
          <span className="excalidraw-icon" aria-hidden="true">✏️</span>
          <span className="excalidraw-name">{title}</span>
          <button
            type="button"
            className="excalidraw-fullscreen-btn"
            title="Open fullscreen"
            onClick={() => setIsFullscreen(true)}
          >
            ⤢
          </button>
        </div>
      )}

      {/* Inline canvas */}
      <div className="excalidraw-inline-wrap">
        <Suspense fallback={
          <div className="excalidraw-loading">Loading canvas…</div>
        }>
          <Excalidraw
            theme={theme}
            viewModeEnabled={!isEditable}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            excalidrawAPI={(api: any) => { inlineAPIRef.current = api }}
            initialData={initialData}
            onChange={() => {
              if (inlineAPIRef.current) scheduleInlineSave(inlineAPIRef.current)
            }}
            UIOptions={{
              canvasActions: {
                export: false,
                loadScene: false,
                saveAsImage: false,
                saveToActiveFile: false,
              },
            }}
          />
        </Suspense>

        {borderless && isEditable && (
          <button
            type="button"
            className="excalidraw-fullscreen-btn excalidraw-fullscreen-btn--floating"
            title="Open fullscreen"
            onClick={() => setIsFullscreen(true)}
          >
            ⤢
          </button>
        )}

        {borderless && isEditable && (
          <div
            className="excalidraw-activate-overlay"
            onClick={() => setIsActive(true)}
          >
            <span className="excalidraw-activate-hint">Click to draw</span>
          </div>
        )}
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen && createPortal(
        <div className="excalidraw-overlay">
          <div className="excalidraw-overlay-bar">
            <span className="excalidraw-overlay-title">✏️ {title}</span>
            <button type="button" className="excalidraw-done-btn" onClick={saveFromFullscreen}>
              Done
            </button>
          </div>
          <div className="excalidraw-canvas-wrap">
            <Suspense fallback={<div style={{ padding: 24, color: 'var(--c-text-3)' }}>Loading…</div>}>
              <Excalidraw
                theme={theme}
                viewModeEnabled={!isEditable}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                excalidrawAPI={(api: any) => { fullscreenAPIRef.current = api }}
                initialData={initialData}
              />
            </Suspense>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
