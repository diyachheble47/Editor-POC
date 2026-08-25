import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot } from 'lexical'
import { $isHeadingNode } from '@lexical/rich-text'
import { useDocument } from '../../context/DocumentContext'
import type { OutlineItem } from '../../context/DocumentContext'

export function OutlinePlugin() {
  const [editor] = useLexicalComposerContext()
  const { setOutline } = useDocument()

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
        setOutline(items)
      })
    }

    extract()
    return editor.registerUpdateListener(() => extract())
  }, [editor, setOutline])

  return null
}
