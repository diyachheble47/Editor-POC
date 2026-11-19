// Full-screen, read-only rendering of the document exactly as it stands right
// now — a second, throwaway Lexical editor fed a snapshot of the real one's
// state (same node set, so every custom block decorates identically), with
// none of the editing plugins (no slash menu, no drag handles, no save).
// `pointer-events: none` on the rendered content is what actually makes it
// inert — several blocks (Mermaid's click-to-edit, ResizeFrame's handles,
// spreadsheet cells…) listen for pointer events themselves regardless of the
// Lexical editor's own `editable` flag, so that flag alone wouldn't stop a
// click from reaching them.

import { useEffect } from 'react'
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
    const serialized = JSON.stringify(sourceEditor.getEditorState())
    editor.setEditorState(editor.parseEditorState(serialized))
  }, [editor, sourceEditor])
  return null
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

  return createPortal(
    <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="Document preview">
      <div className="preview-overlay-bar">
        <span className="preview-overlay-badge">Preview</span>
        <span className="preview-overlay-title">{title || 'Untitled'}</span>
        <button type="button" className="preview-overlay-close" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="preview-overlay-scroll">
        <div className="preview-overlay-page">
          <h1 className="preview-overlay-doc-title">{title || 'Untitled'}</h1>
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
        </div>
      </div>
    </div>,
    document.body,
  )
}
