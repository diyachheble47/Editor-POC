import { useEffect, useRef } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection } from 'lexical'

export function BlockMovementPlugin() {
  const [editor] = useLexicalComposerContext()
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const unregisterRootListener = editor.registerRootListener((root) => {
      // Remove listener from the previous root before attaching to new one
      cleanupRef.current?.()
      cleanupRef.current = null

      if (!root) return

      function onKeyDown(e: KeyboardEvent) {
        if (!e.altKey || !e.shiftKey) return
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return

        e.preventDefault()

        editor.update(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return

          const topLevel = selection.anchor.getNode().getTopLevelElementOrThrow()

          if (e.key === 'ArrowUp') {
            const prev = topLevel.getPreviousSibling()
            if (prev) prev.insertBefore(topLevel)
          } else {
            const next = topLevel.getNextSibling()
            if (next) next.insertAfter(topLevel)
          }
        })
      }

      root.addEventListener('keydown', onKeyDown)
      cleanupRef.current = () => root.removeEventListener('keydown', onKeyDown)
    })

    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
      unregisterRootListener()
    }
  }, [editor])

  return null
}
