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
import { useDocument, docCorruptedBackupKey } from '../../context/DocumentContext'
import { getSegment0State, deleteSegment0State } from '../../storage/documentRepo'

const CHUNK_SIZE = 4
const TICK_MS = 25

export function InitStreamPlugin() {
  const [editor] = useLexicalComposerContext()
  const { activeDocId, activeDocSeedDemo, setRestoreWarning } = useDocument()

  useEffect(() => {
    let cancelled = false
    const backupKey = docCorruptedBackupKey(activeDocId)

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

    async function init() {
      // Restore saved state from Dexie if it exists
      const saved = await getSegment0State(activeDocId)
      if (cancelled) return

      if (saved !== null) {
        try {
          const state = saved as Parameters<typeof editor.parseEditorState>[0]
          editor.setEditorState(editor.parseEditorState(state))
          return
        } catch (err) {
          // Back up the unparseable state instead of deleting it outright —
          // a document isn't silently destroyed just because (for example)
          // it references a node type that's since been removed or renamed.
          // It stays recoverable from localStorage/devtools even though the
          // editor itself can't open it.
          try {
            localStorage.setItem(backupKey, JSON.stringify({
              savedAt: new Date().toISOString(),
              error: err instanceof Error ? err.message : String(err),
              state: saved,
            }))
          } catch {
            // backup best-effort; still proceed to clear the unusable primary state
          }
          await deleteSegment0State(activeDocId)
          if (cancelled) return
          setRestoreWarning(
            'This document could not be restored — it may reference a feature that changed. ' +
            'A backup copy was kept in local storage under "' + backupKey + '" instead of being deleted. ' +
            (activeDocSeedDemo
              ? 'Showing the sample document below; your actual content was not overwritten yet.'
              : 'Starting from a blank document; your actual content was not overwritten yet.'),
          )
        }
      }

      if (cancelled) return

      // Clear any content from a previous cancelled run (handles React StrictMode double-invoke)
      editor.update(() => {
        $getRoot().clear()
      })

      // Only the one document seeded on a completely fresh install streams the
      // demo content — every other new document (via "New document") starts
      // genuinely blank.
      if (!activeDocSeedDemo) {
        editor.update(() => {
          $getRoot().append($createParagraphNode())
        })
        return
      }

      await streamDocument()
    }

    init()
    return () => {
      cancelled = true
    }
  }, [editor, activeDocId, activeDocSeedDemo, setRestoreWarning])

  return null
}
