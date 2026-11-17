// Keeps a paragraph after the last block, so there is always somewhere to put
// the cursor below a table, graph, circuit, code block, image...: Lexical can't
// place a caret after a block like that. Also: clicking the empty space under
// the page puts the cursor at the very end.

import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createParagraphNode, $getRoot, $isParagraphNode, RootNode } from 'lexical'
import { $isHeadingNode, $isQuoteNode } from '@lexical/rich-text'
import { $isListNode } from '@lexical/list'

export function TrailingParagraphPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    // Only touches the document while editable: streamed / AI-built content
    // arrives with the editor read-only and is topped up when it unlocks.
    function ensure() {
      if (!editor.isEditable()) return
      editor.update(() => {
        const last = $getRoot().getLastChild()
        if (!last) return
        if ($isParagraphNode(last) || $isHeadingNode(last) || $isQuoteNode(last) || $isListNode(last)) return
        $getRoot().append($createParagraphNode())
      }, { tag: ['history-merge', 'tnb-trailing'] })
    }

    const offTransform = editor.registerNodeTransform(RootNode, () => {
      if (!editor.isEditable()) return
      const last = $getRoot().getLastChild()
      if (!last) return
      if ($isParagraphNode(last) || $isHeadingNode(last) || $isQuoteNode(last) || $isListNode(last)) return
      $getRoot().append($createParagraphNode())
    })
    const offEditable = editor.registerEditableListener(editable => { if (editable) ensure() })

    const scroller = editor.getRootElement()?.closest('.editor-area-scroll') ?? null
    function onClick(e: Event) {
      const target = e.target as HTMLElement
      if (target.closest('.editor-input, input, textarea, button, select, aside')) return
      if (!editor.isEditable()) return
      editor.focus(() => editor.update(() => { $getRoot().selectEnd() }))
    }
    scroller?.addEventListener('click', onClick)

    return () => {
      offTransform()
      offEditable()
      scroller?.removeEventListener('click', onClick)
    }
  }, [editor])

  return null
}
