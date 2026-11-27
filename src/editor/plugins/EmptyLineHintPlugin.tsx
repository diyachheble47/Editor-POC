// Shows the "Type "/" to insert, or start writing…" hint on whichever empty line the cursor is on.
//
// Lexical's own placeholder only appears while the whole document is empty. A teacher who puts the
// cursor on an empty line in the middle of a document gets the same hint (as a class on that line,
// drawn by CSS), so every empty line they land on says what to do. The first line of an empty
// document keeps Lexical's placeholder, so the hint is never shown twice.

import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot, $getSelection, $isParagraphNode, $isRangeSelection } from 'lexical'
import { $getRealTopLevelAncestor } from '../blockRegistry'

const CLASS = 'empty-line-hint'

export function EmptyLineHintPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    let marked: HTMLElement | null = null
    const mark = (el: HTMLElement | null) => {
      if (el === marked) return
      marked?.classList.remove(CLASS)
      el?.classList.add(CLASS)
      marked = el
    }
    const off = editor.registerUpdateListener(({ editorState }) => {
      const key = editorState.read((): string | null => {
        if (!editor.isEditable()) return null
        const sel = $getSelection()
        if (!$isRangeSelection(sel) || !sel.isCollapsed()) return null
        const top = $getRealTopLevelAncestor(sel.anchor.getNode())
        if (!top || !$isParagraphNode(top) || top.getTextContent() !== '') return null
        const root = $getRoot()
        // Only line in the document: Lexical's placeholder is already showing.
        if (root.getChildrenSize() === 1) return null
        return top.getKey()
      })
      mark(key ? editor.getElementByKey(key) : null)
    })
    return () => { off(); mark(null) }
  }, [editor])

  return null
}
