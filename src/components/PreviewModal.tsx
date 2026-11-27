// Full-screen, read-only rendering of the document exactly as it stands right
// now — a second, throwaway Lexical editor fed a snapshot of the real one's
// state (same node set, so every custom block decorates identically), with
// none of the editing plugins (no slash menu, no drag handles, no save).
// Blocks stay interactive here (quiz answers, 3D rotate/zoom, diagrams, HTML
// activities). ReadOnlyContext stops them from opening their editing UI, and
// the resize corners are hidden (see preview.css).
import { ReadOnlyContext } from '../editor/nodes/_shared/readOnlyContext'

import { Component, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PREPARE_PRINT_EVENT } from '../editor/nodes/model3d/Model3DViewer'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin'
import { TablePlugin } from '@lexical/react/LexicalTablePlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import type { LexicalEditor } from 'lexical'
import { editorConfig } from '../editor/EditorConfig'
import { CodeHighlightPlugin } from '../editor/plugins/CodeHighlightPlugin'
import { SectionCardsPlugin } from '../editor/plugins/SectionCardsPlugin'
import { ReadAloudPlayer } from './ReadAloudControl'

/** Hands the preview's own editor to the player in the bar above (it lives outside the composer). */
function EditorBridge({ onEditor }: { onEditor: (e: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => { onEditor(editor) }, [editor, onEditor])
  return null
}

/** Copies the live document's current state into this preview's own editor, once. */
function PreviewSync({ sourceEditor }: { sourceEditor: LexicalEditor }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    // Reading the source editor's state from here can occasionally land in
    // the middle of one of ITS own pending updates (observed with the
    // Excalidraw block's debounced autosave firing around the same tick as
    // Preview opening) and come back as a bare, child-less root — which
    // Lexical refuses to load ("root node never becomes empty") and throws.
    // Since nothing here has an error boundary below the page's own root,
    // an uncaught throw from this effect would take down the whole app, not
    // just the preview — so this is deliberately defensive rather than
    // letting that exception propagate.
    try {
      const serialized = JSON.stringify(sourceEditor.getEditorState())
      const parsed = JSON.parse(serialized)
      if (!parsed?.root?.children?.length) return
      editor.setEditorState(editor.parseEditorState(serialized))
    } catch (e) {
      console.error('Preview: could not snapshot the document, showing it empty.', e)
    }
  }, [editor, sourceEditor])
  return null
}

class PreviewErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.error('Preview crashed, closed by its own error boundary.', error) }
  render() {
    if (this.state.failed) {
      return <div className="preview-overlay-error">Couldn&apos;t render the preview. Try again, or edit the document and reopen it.</div>
    }
    return this.props.children
  }
}

// Printing lays out off-screen, so 3D models only build once told to. Wait until each
// one in the preview has its snapshot, but never longer than this (a model that fails
// to load shouldn't block the print forever).
const PRINT_WAIT_MS = 8000

function waitForPrintReady(): Promise<void> {
  window.dispatchEvent(new Event(PREPARE_PRINT_EVENT))
  return new Promise(resolve => {
    const deadline = Date.now() + PRINT_WAIT_MS
    const check = () => {
      const pending = document.querySelector('.preview-overlay [data-model3d]:not([data-print-ready])')
      if (!pending || Date.now() > deadline) resolve()
      else setTimeout(check, 100)
    }
    check()
  })
}

export function PreviewModal({
  sourceEditor, title, onClose, autoPrint = false,
}: {
  sourceEditor: LexicalEditor
  title: string
  onClose: () => void
  /** TopBar's "Export PDF" button: skip straight to the print dialog instead
   * of making the user open Preview and click a second button inside it,
   * and close this overlay on its own once that dialog is dismissed. */
  autoPrint?: boolean
}) {
  const [previewEditor, setPreviewEditor] = useState<LexicalEditor | null>(null)
  // Closing the preview always silences the reader, however it was closed.
  useEffect(() => () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel() }, [])
  useEffect(() => {
    if (autoPrint) return // off-screen and auto-closing — nothing for Escape to close, nothing to scroll-lock behind
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose, autoPrint])

  // "Export PDF" is the browser's own print dialog pointed at "Save as PDF"
  // — not a PDF library. This preview is already a faithful, real-DOM
  // rendering of the document (same SVGs for Mermaid/katex/molecules, same
  // tables), so printing it directly produces a correct PDF with zero extra
  // dependencies; a library like html2canvas+jsPDF would rasterize all of
  // that into blurry, unselectable images instead. The document's current
  // theme is forced to light for the printout (ink-friendly, and dark
  // panel backgrounds print badly) and restored once the print dialog closes.
  const handlePrint = useCallback(() => {
    const root = document.documentElement
    const prevTheme = root.getAttribute('data-theme')
    root.setAttribute('data-theme', 'light')
    const restore = () => {
      if (prevTheme) root.setAttribute('data-theme', prevTheme)
      else root.removeAttribute('data-theme')
      window.removeEventListener('afterprint', restore)
      // TopBar's "Export PDF" never meant to leave this overlay open — it
      // was only here to give the print layout something to render from.
      if (autoPrint) onClose()
    }
    window.addEventListener('afterprint', restore)
    void waitForPrintReady().then(() => requestAnimationFrame(() => window.print()))
  }, [autoPrint, onClose])

  // Autoprint fires once per mount, after the sync effect above has had a
  // chance to land the real content (see its own "wait a tick" reasoning).
  // React 19 StrictMode (dev only) mounts, cleans up, then mounts again —
  // the cleanup here must reset `fired` too, or the second (real) mount
  // sees it already true from the first (torn-down) one and never
  // reschedules at all, so autoPrint silently never fires.
  const firedRef = useRef(false)
  useEffect(() => {
    if (!autoPrint || firedRef.current) return
    firedRef.current = true
    const t = setTimeout(handlePrint, 50)
    return () => { clearTimeout(t); firedRef.current = false }
  }, [autoPrint, handlePrint])

  return createPortal(
    <div
      className={`preview-overlay${autoPrint ? ' preview-overlay-autoprint' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Document preview"
    >
      {!autoPrint && (
        <div className="preview-overlay-bar">
          <span className="preview-overlay-badge">Preview</span>
          <span className="preview-overlay-title">{title || 'Untitled'}</span>
          <ReadAloudPlayer editor={previewEditor} />
          <button type="button" className="preview-overlay-close" onClick={onClose}>
            Close
          </button>
        </div>
      )}
      <div className="preview-overlay-scroll">
        <div className="preview-overlay-page">
          <h1 className="preview-overlay-doc-title">{title || 'Untitled'}</h1>
          <PreviewErrorBoundary>
            <ReadOnlyContext.Provider value={true}>
            <LexicalComposer initialConfig={{ ...editorConfig, namespace: 'doc-preview', editable: false }}>
              <RichTextPlugin
                contentEditable={<ContentEditable className="editor-input preview-overlay-input" aria-label="Document preview" />}
                placeholder={null}
                ErrorBoundary={LexicalErrorBoundary}
              />
              <ListPlugin />
              <HorizontalRulePlugin />
              <TablePlugin />
              <CodeHighlightPlugin />
              <SectionCardsPlugin />
              <PreviewSync sourceEditor={sourceEditor} />
              <EditorBridge onEditor={setPreviewEditor} />
            </LexicalComposer>
            </ReadOnlyContext.Provider>
          </PreviewErrorBoundary>
        </div>
      </div>
    </div>,
    document.body,
  )
}
