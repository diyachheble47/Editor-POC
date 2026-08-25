import { useRef, useState, lazy, Suspense, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import type { NodeKey } from 'lexical'
import { $getExcalidrawNodeByKey } from './ExcalidrawNode'
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
  const [isFullscreen, setIsFullscreen] = useState(false)
  const inlineAPIRef = useRef<ExcalidrawAPI | null>(null)
  const fullscreenAPIRef = useRef<ExcalidrawAPI | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      viewBackgroundColor: '#ffffff',
    },
  }

  return (
    <div className="excalidraw-block" contentEditable={false}>
      {/* Header bar */}
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

      {/* Inline canvas */}
      <div className="excalidraw-inline-wrap">
        <Suspense fallback={
          <div className="excalidraw-loading">Loading canvas…</div>
        }>
          <Excalidraw
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
