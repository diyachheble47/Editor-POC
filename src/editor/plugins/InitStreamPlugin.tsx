import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createParagraphNode, $getRoot, CLEAR_HISTORY_COMMAND } from 'lexical'
import { useDocument } from '../../context/DocumentContext'
import { streamServerDocument } from '../../storage/api'
import { createDocumentStreamBuilder } from '../streamIntoEditor'

// Opening a document streams its saved content from the server (Server-Sent
// Events) and builds it in the editor as it arrives: text types in, other
// blocks (models, equations, circuits...) appear whole. A document that was
// never saved starts blank.
export function InitStreamPlugin() {
  const [editor] = useLexicalComposerContext()
  const { activeDocId, setRestoreWarning, markClean } = useDocument()

  useEffect(() => {
    const abort = new AbortController()
    const builder = createDocumentStreamBuilder(editor)

    async function init() {
      // Read-only while the document is being built, so typing can't land in
      // the middle of it (and a half-built document can't be saved).
      editor.setEditable(false)
      try {
        const found = await streamServerDocument(
          activeDocId,
          // Events already buffered when an abort lands must not touch the editor.
          e => { if (!abort.signal.aborted) builder.apply(e) },
          abort.signal,
        )
        if (abort.signal.aborted) return
        if (!found) {
          editor.update(() => {
            $getRoot().clear()
            $getRoot().append($createParagraphNode())
          }, { discrete: true })
        }
        if (builder.skipped > 0) {
          setRestoreWarning(
            `${builder.skipped} block${builder.skipped === 1 ? '' : 's'} could not be shown ` +
            '(a feature changed or was removed). Saving will drop them from the stored copy.',
          )
        }
        editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined) // Undo must not undo the load
        markClean() // opening a document isn't an edit
      } catch {
        if (abort.signal.aborted) return
        // Stay read-only: the editor holds only part of the document, and
        // saving it would overwrite the full copy on the server.
        setRestoreWarning('Could not load this whole document from the server. It is read-only so a partial copy cannot be saved. Check that the backend is running, then reload.')
        return
      }
      editor.setEditable(true)
    }

    void init()
    return () => abort.abort()
  }, [editor, activeDocId, setRestoreWarning, markClean])

  return null
}
