// Full-screen, read-only rendering of the document exactly as it stands right
// now — a second, throwaway Lexical editor fed a snapshot of the real one's
// state (same node set, so every custom block decorates identically), with
// none of the editing plugins (no slash menu, no drag handles, no save).
// `pointer-events: none` on the rendered content is what actually makes it
// inert — several blocks (Mermaid's click-to-edit, ResizeFrame's handles,
// spreadsheet cells…) listen for pointer events themselves regardless of the
// Lexical editor's own `editable` flag, so that flag alone wouldn't stop a
// click from reaching them.

import { Component, useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
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

export function PreviewModal({
  sourceEditor, title, onClose,
}: {
  sourceEditor: LexicalEditor
  title: string
  onClose: () => void
}) {
  useEffect(() => {
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
  }, [onClose])

  // "Export PDF" is the browser's own print dialog pointed at "Save as PDF"
  // — not a PDF library. This preview is already a faithful, real-DOM
  // rendering of the document (same SVGs for Mermaid/katex/molecules, same
  // tables), so printing it directly produces a correct PDF with zero extra
  // dependencies; a library like html2canvas+jsPDF would rasterize all of
  // that into blurry, unselectable images instead. The document's current
  // theme is forced to light for the printout (ink-friendly, and dark
  // panel backgrounds print badly) and restored once the print dialog closes.
  function handlePrint() {
    const root = document.documentElement
    const prevTheme = root.getAttribute('data-theme')
    root.setAttribute('data-theme', 'light')
    const restore = () => {
      if (prevTheme) root.setAttribute('data-theme', prevTheme)
      else root.removeAttribute('data-theme')
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    requestAnimationFrame(() => window.print())
  }

  return createPortal(
    <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="Document preview">
      <div className="preview-overlay-bar">
        <span className="preview-overlay-badge">Preview</span>
        <span className="preview-overlay-title">{title || 'Untitled'}</span>
        <button type="button" className="preview-overlay-print" onClick={handlePrint}>
          Export PDF
        </button>
        <button type="button" className="preview-overlay-close" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="preview-overlay-scroll">
        <div className="preview-overlay-page">
          <h1 className="preview-overlay-doc-title">{title || 'Untitled'}</h1>
          <PreviewErrorBoundary>
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
            </LexicalComposer>
          </PreviewErrorBoundary>
        </div>
      </div>
    </div>,
    document.body,
  )
}
