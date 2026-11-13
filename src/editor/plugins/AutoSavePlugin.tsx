import { useEffect, useRef } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot } from 'lexical'
import type { EditorState } from 'lexical'
import { useDocument } from '../../context/DocumentContext'
import { saveSegment0State } from '../../storage/documentRepo'

const DEBOUNCE_MS = 1500

export function AutoSavePlugin() {
  const [editor] = useLexicalComposerContext()
  const { activeDocId, markDirty, save, setWordCount } = useDocument()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The most recent not-yet-written editor state, if the debounce timer
  // hasn't fired yet. Lets `flush()` save immediately instead of waiting
  // out the rest of the debounce window.
  const pendingStateRef = useRef<EditorState | null>(null)

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
    // Writes whatever change is still pending right now, bypassing the
    // debounce. Without this, a refresh/tab-close/document-switch within
    // the 1.5s debounce window silently drops the last edit — e.g.
    // uploading a 3D model, then refreshing a second later, loses the
    // upload entirely because it was never written to IndexedDB at all.
    function flush() {
      const editorState = pendingStateRef.current
      if (!editorState) return
      pendingStateRef.current = null
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      editorState.read(() => {
        const text = $getRoot().getTextContent()
        const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
        const state = editorState.toJSON()

        saveSegment0State(activeDocId, state)
          .catch(() => { /* quota or IndexedDB error — in-memory state is still correct for this session */ })
          .finally(() => save(wordCount))
      })
    }

    // 'visibilitychange' (not just 'beforeunload') because it reliably
    // fires on tab switch, minimize, and refresh/close alike, and doesn't
    // block the page from entering the back/forward cache the way
    // 'beforeunload' can.
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', flush)

    const unregister = editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return

      markDirty()
      pendingStateRef.current = editorState

      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(flush, DEBOUNCE_MS)
    })

    return () => {
      // Also flush on unmount (e.g. switching documents remounts this
      // plugin entirely) so a quick document switch doesn't lose the same
      // way a quick refresh would.
      flush()
      unregister()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', flush)
    }
  }, [editor, activeDocId, markDirty, save])

  return null
}
