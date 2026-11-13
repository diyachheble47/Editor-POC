import { useEffect, useRef } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot } from 'lexical'
import { $isHeadingNode } from '@lexical/rich-text'
import { useDocument } from '../../context/DocumentContext'
import type { OutlineItem } from '../../context/DocumentContext'

function outlinesEqual(a: OutlineItem[], b: OutlineItem[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].key !== b[i].key || a[i].tag !== b[i].tag || a[i].text !== b[i].text) return false
  }
  return true
}

export function OutlinePlugin() {
  const [editor] = useLexicalComposerContext()
  const { setOutline } = useDocument()
  // Tracks the last outline actually pushed to DocumentContext. Without
  // this, every single editor update (typing anywhere, not just in a
  // heading) built a brand-new array and called setOutline with it — a new
  // array identity on every keystroke, which re-renders every consumer of
  // DocumentContext's outline (the sidebar) even when no heading changed.
  const lastOutlineRef = useRef<OutlineItem[]>([])

  useEffect(() => {
    function extract() {
      editor.getEditorState().read(() => {
        const items: OutlineItem[] = []
        for (const child of $getRoot().getChildren()) {
          if ($isHeadingNode(child)) {
            const text = child.getTextContent().trim()
            if (text) {
              items.push({
                key: child.getKey(),
                tag: child.getTag() as 'h1' | 'h2' | 'h3',
                text,
              })
            }
          }
        }
        if (outlinesEqual(lastOutlineRef.current, items)) return
        lastOutlineRef.current = items
        setOutline(items)
      })
    }

    extract()
    return editor.registerUpdateListener(() => extract())
  }, [editor, setOutline])

  return null
}
