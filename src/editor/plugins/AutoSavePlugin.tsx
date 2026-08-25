import { useEffect, useRef } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot } from 'lexical'
import { useDocument } from '../../context/DocumentContext'

export const EDITOR_STORAGE_KEY = 'lexical-doc-state'
const DEBOUNCE_MS = 1500

export function AutoSavePlugin() {
  const [editor] = useLexicalComposerContext()
  const { markDirty, save, setWordCount } = useDocument()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Compute word count once on mount so it's correct on page load with restored content
  useEffect(() => {
    editor.getEditorState().read(() => {
      const text = $getRoot().getTextContent()
      const wc = text.trim() ? text.trim().split(/\s+/).length : 0
      if (wc > 0) setWordCount(wc)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return

      markDirty()

      if (timerRef.current !== null) clearTimeout(timerRef.current)

      timerRef.current = setTimeout(() => {
        editorState.read(() => {
          const text = $getRoot().getTextContent()
          const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
          const json = JSON.stringify(editorState.toJSON())

          try {
            localStorage.setItem(EDITOR_STORAGE_KEY, json)
          } catch { /* quota */ }

          save(json, wordCount)
        })
        timerRef.current = null
      }, DEBOUNCE_MS)
    })
  }, [editor, markDirty, save])

  return null
}
