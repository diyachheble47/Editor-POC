import { useEffect, useRef } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

export const EDITOR_STORAGE_KEY = 'lexical-doc-state'
const DEBOUNCE_MS = 600

export function AutoSavePlugin() {
  const [editor] = useLexicalComposerContext()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return

      if (timerRef.current !== null) clearTimeout(timerRef.current)

      timerRef.current = setTimeout(() => {
        try {
          localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(editorState.toJSON()))
        } catch {
          // Silently ignore storage quota errors
        }
        timerRef.current = null
      }, DEBOUNCE_MS)
    })
  }, [editor])

  return null
}
