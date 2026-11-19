// The slash menu's "Generate": pick a block type, type a topic, get exactly
// that one block inserted right where the cursor was — not a whole-document
// edit. Deliberately NOT the AgentPanel/'edit' pipeline that the rest of the
// AI Agent uses: that always re-sends and rebuilds the ENTIRE document (so it
// can safely keep everything untouched) and always stops for a preview/
// Accept step. Neither makes sense for "drop one equation in right here" —
// the document isn't at risk (nothing existing is ever touched), the
// position the model might pick is irrelevant (it never has the document to
// place anything relative to), and the whole point is that it lands
// immediately, in the right place, with no extra step.

import { $createParagraphNode, $getNodeByKey, $getRoot, $isParagraphNode } from 'lexical'
import type { LexicalEditor, NodeKey } from 'lexical'
import { $createNodeFromAiBlock } from '../aiStreamBuilder'
import { ApiError, streamAiDocument } from '../../storage/api'
import type { AiRequest } from '../../storage/api'

export interface GenerateBlockHooks {
  setAiState: (state: { status: 'idle' | 'generating' | 'error'; message: string | null; startedAt?: number }) => void
  aiAbortRef: { current: (() => void) | null }
}

/**
 * `anchorKey`: the (now-empty) paragraph the typed "/generate …" occupied,
 * captured at the moment Run was pressed — not re-read from the live
 * selection once the AI responds, since the user is free to click elsewhere
 * while a request is in flight and the block must still land back where
 * they asked for it, not wherever the cursor has since wandered.
 */
export async function generateBlockAtAnchor(
  editor: LexicalEditor,
  anchorKey: NodeKey,
  label: string,
  topic: string,
  hooks: GenerateBlockHooks,
): Promise<void> {
  const ai = new AbortController()
  hooks.aiAbortRef.current = () => ai.abort()
  hooks.setAiState({ status: 'generating', message: null, startedAt: Date.now() })

  const request: AiRequest = {
    title: topic.slice(0, 120),
    description: `Add ONE new ${label} block about: ${topic}. Nothing else: no heading, no title, no intro text, and no other block.`,
    kind: 'lesson',
  }

  let got = false
  let failure: string | null = null
  try {
    await streamAiDocument(request, event => {
      if (got) return
      if (event.t === 'error') { failure = event.message; return }
      if (event.t !== 'block' || event.block.type === 'keep') return
      got = true
      editor.update(() => {
        try {
          const node = $createNodeFromAiBlock(event.block)
          const anchor = $getNodeByKey(anchorKey)
          if (anchor) {
            anchor.insertAfter(node)
            let after = node.getNextSibling()
            if (!$isParagraphNode(after)) {
              after = $createParagraphNode()
              node.insertAfter(after)
            }
            after.selectStart()
            if ($isParagraphNode(anchor) && anchor.getTextContent() === '') anchor.remove()
          } else {
            // The anchor paragraph is gone (edited away while this was in
            // flight) — still land the block rather than lose it.
            $getRoot().append(node)
          }
        } catch { /* unparseable — nothing to insert */ }
      })
      // No whole-document "keep every other block" protocol is in play here
      // (unlike 'edit'), so nothing is lost by stopping the model right away
      // once its one requested block has arrived.
      ai.abort()
    }, ai.signal)
  } catch (err) {
    if (!ai.signal.aborted) {
      failure = err instanceof ApiError && err.status === 503
        ? 'The AI is not set up yet: add GEMINI_API_KEY to backend/.env and restart the backend.'
        : 'Could not reach the AI service.'
    }
  }
  hooks.aiAbortRef.current = null
  hooks.setAiState(
    got ? { status: 'idle', message: null }
      : failure ? { status: 'error', message: failure }
        : { status: 'idle', message: null }, // user stopped it, or the model returned nothing
  )
}
