import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $isParagraphNode,
} from 'lexical'
import type { NodeKey } from 'lexical'
import { MOCK_DOCUMENT_PARAGRAPHS } from '../mockDocument'
import { EDITOR_STORAGE_KEY as STORAGE_KEY } from './AutoSavePlugin'
const CHUNK_SIZE = 4
const TICK_MS = 25

export function InitStreamPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    // Restore saved state if it exists
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        editor.setEditorState(editor.parseEditorState(saved))
        return
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }

    // Clear any content from a previous cancelled run (handles React StrictMode double-invoke)
    editor.update(() => {
      $getRoot().clear()
    })

    let cancelled = false

    async function streamDocument() {
      for (const text of MOCK_DOCUMENT_PARAGRAPHS) {
        if (cancelled) break

        let paragraphKey: NodeKey | null = null
        editor.update(() => {
          const paragraph = $createParagraphNode()
          $getRoot().append(paragraph)
          paragraphKey = paragraph.getKey()
        })

        for (let i = 0; i < text.length; i += CHUNK_SIZE) {
          if (cancelled) break
          const chunk = text.slice(i, i + CHUNK_SIZE)
          await new Promise<void>((resolve) => setTimeout(resolve, TICK_MS))
          editor.update(() => {
            if (!paragraphKey) return
            const node = $getNodeByKey(paragraphKey)
            if ($isParagraphNode(node)) {
              node.append($createTextNode(chunk))
            }
          })
        }

        await new Promise<void>((resolve) => setTimeout(resolve, 120))
      }
    }

    streamDocument()
    return () => {
      cancelled = true
    }
  }, [editor])

  return null
}
