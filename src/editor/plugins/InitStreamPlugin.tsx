import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createParagraphNode, $getRoot, CLEAR_HISTORY_COMMAND } from 'lexical'
import { useDocument } from '../../context/DocumentContext'
import { ApiError, streamAiDocument, streamServerDocument } from '../../storage/api'
import type { AiRequest } from '../../storage/api'
import { createAiStreamBuilder } from '../aiStreamBuilder'
import { createDocumentStreamBuilder } from '../streamIntoEditor'
import { loadDocumentState } from '../../storage/documentStore'

// Opening a saved document loads its content in one step (no animation). The
// streamed build with typing is used only when AI writes into the document:
// the first generation, or a later change made by the AI. A document that was
// never saved starts blank.
export function InitStreamPlugin() {
  const [editor] = useLexicalComposerContext()
  const { activeDocId, setRestoreWarning, markClean, markDirty, takeAiJob, isDocSaved, setAiState, aiAbortRef, setDocLoading } = useDocument()

  useEffect(() => {
    const abort = new AbortController()
    const builder = createDocumentStreamBuilder(editor)

    // Generates content into a freshly created document: the server relays
    // Gemini's output as events, which are built into the editor as they
    // arrive. Stop keeps whatever has been written so far.
    async function generate(request: AiRequest) {
      const ai = new AbortController()
      const stopOnUnmount = () => ai.abort()
      abort.signal.addEventListener('abort', stopOnUnmount)
      aiAbortRef.current = () => ai.abort()
      const builder = createAiStreamBuilder(editor)
      let blocks = 0
      let failure: string | null = null
      setAiState({ status: 'generating', message: null, startedAt: Date.now() })
      editor.update(() => { $getRoot().clear() }, { discrete: true, tag: 'skip-scroll-into-view' })
      try {
        await streamAiDocument(request, event => {
          if (event.t === 'error') { failure = event.message; return }
          if (event.t === 'open' || event.t === 'block') blocks++
          builder.apply(event)
        }, ai.signal)
      } catch (err) {
        if (abort.signal.aborted) return // document switched away
        if (!ai.signal.aborted) {
          failure = err instanceof ApiError && err.status === 503
            ? 'The AI is not set up yet: add LITELLM_BASE_URL and LITELLM_API_KEY to backend/.env and restart the backend.'
            : 'Could not reach the AI service. Check that the backend is running.'
        }
      } finally {
        abort.signal.removeEventListener('abort', stopOnUnmount)
        aiAbortRef.current = null
      }
      if (abort.signal.aborted) return
      builder.finish()
      if (blocks > 0) markDirty() // generated content still needs the user's Save
      setAiState(failure ? { status: 'error', message: failure } : { status: 'idle', message: null })
    }

    async function init() {
      // React's StrictMode (dev) mounts, cleans up and re-mounts this effect in
      // one go. Wait one tick so only the mount that survives goes on to start a
      // request and take the AI job; the discarded one must not consume it.
      await Promise.resolve()
      if (abort.signal.aborted) return

      // Read-only while the document is being built, so typing can't land in
      // the middle of it (and a half-built document can't be saved).
      editor.setEditable(false)
      setDocLoading(true)

      // Opening a saved document shows it at once: one fetch, then the whole
      // content is set in one step, with no typing animation. Only a document
      // that cannot be read that way falls back to the block-by-block stream,
      // which skips the blocks it cannot show.
      async function openSavedDocument(): Promise<boolean> {
        const state = await loadDocumentState(activeDocId)
        if (abort.signal.aborted) return true
        if (state == null) return false
        try {
          editor.setEditorState(editor.parseEditorState(JSON.stringify(state)), { tag: 'history-merge' })
          return true
        } catch {
          return streamServerDocument(
            activeDocId,
            // Events already buffered when an abort lands must not touch the editor.
            e => { if (!abort.signal.aborted) builder.apply(e) },
            abort.signal,
          )
        }
      }

      try {
        // A document that was never saved has nothing on the server to stream
        // (asking would just return a 404), so it starts blank.
        const found = !isDocSaved(activeDocId) ? false : await openSavedDocument()
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
        const job = takeAiJob(activeDocId)
        if (job) await generate(job)
      } catch {
        if (abort.signal.aborted) return
        // Stay read-only: the editor holds only part of the document, and
        // saving it would overwrite the full copy on the server.
        setRestoreWarning('Could not load this whole document from the server. It is read-only so a partial copy cannot be saved. Check that the backend is running, then reload.')
        return
      }
      editor.setEditable(true)
    }

    void init().finally(() => { if (!abort.signal.aborted) setDocLoading(false) })
    return () => { abort.abort(); setDocLoading(false) }
  }, [editor, activeDocId, setRestoreWarning, markClean, markDirty, takeAiJob, isDocSaved, setAiState, aiAbortRef, setDocLoading])

  return null
}
