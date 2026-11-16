import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot } from 'lexical'
import { useDocument } from '../../context/DocumentContext'

// Connects the editor to the document's explicit Save. It writes nothing
// itself: it tells the document context when the content has changed (so the
// top bar shows "Unsaved changes") and tells it how to read the current
// editor state when the user saves.
export function SavePlugin() {
  const [editor] = useLexicalComposerContext()
  const { markDirty, registerSnapshot, setWordCount } = useDocument()

  // Word count once on mount so it's correct on page load with restored content
  useEffect(() => {
    editor.getEditorState().read(() => {
      const text = $getRoot().getTextContent()
      const wc = text.trim() ? text.trim().split(/\s+/).length : 0
      if (wc > 0) setWordCount(wc)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    registerSnapshot(() => {
      // Still being built from the server stream: saving now would store half a document.
      if (!editor.isEditable()) return null
      // Let blocks with debounced writes (3D camera) commit them first.
      window.dispatchEvent(new Event('tnb:flush-pending'))
      const editorState = editor.getEditorState()
      const wordCount = editorState.read(() => {
        const text = $getRoot().getTextContent()
        return text.trim() ? text.trim().split(/\s+/).length : 0
      })
      return { state: editorState.toJSON(), wordCount }
    })

    const unregister = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (!editor.isEditable()) return // content arriving from the server, not an edit
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return
      markDirty()
    })

    return () => {
      unregister()
      registerSnapshot(null)
    }
  }, [editor, markDirty, registerSnapshot])

  return null
}
