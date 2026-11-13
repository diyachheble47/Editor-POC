import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, $getSelection, $isRangeSelection } from 'lexical'
import type { LexicalNode } from 'lexical'
import { getSelectedBlockKey } from '../blockSelection'

export function BlockMovementPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    // Document-level, not the editor root: after clicking a block's handle
    // (a button outside the editor), focus is no longer inside the root, so a
    // root listener would never see the keystroke.
    function onKeyDown(e: KeyboardEvent) {
      if (!e.altKey || !e.shiftKey) return
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return

      e.preventDefault()

      editor.update(() => {
        // A selected block (set by clicking its handle) takes priority over the
        // text cursor, which may be sitting in an unrelated paragraph.
        const selectedBlockKey = getSelectedBlockKey()
        let topLevel: LexicalNode | null = selectedBlockKey ? $getNodeByKey(selectedBlockKey) : null

        if (!topLevel) {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return
          topLevel = selection.anchor.getNode().getTopLevelElementOrThrow()
        }
        if (!topLevel) return

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
