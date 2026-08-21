import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection } from 'lexical'

export function BlockMovementPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.altKey || !e.shiftKey) return
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return

      // Only act when the editor is focused
      const root = editor.getRootElement()
      if (!root || !root.contains(document.activeElement)) return

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

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [editor])

  return null
}
