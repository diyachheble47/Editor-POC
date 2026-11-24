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
import { ApiError, getAiChat, MAX_AI_CHAT_MESSAGES, saveAiChat, streamAiDocument } from '../../storage/api'
import type { AiChatMessage, AiRequest } from '../../storage/api'
import type { GenerateChoice } from './generateChoices'

export interface GenerateBlockHooks {
  docId: string
  setAiState: (state: { status: 'idle' | 'generating' | 'error'; message: string | null; startedAt?: number }) => void
  aiAbortRef: { current: (() => void) | null }
}

/** Dispatched on window. The open AI Agent panel takes the messages (and saves them with its own
 * conversation) by setting `handled`; if nothing took them, they're appended to the saved chat directly. */
export const AI_CHAT_EVENT = 'tnb:ai-chat'
export interface AiChatEvent { docId: string; messages: AiChatMessage[]; handled: boolean }

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

function recordInChat(docId: string, messages: AiChatMessage[]) {
  const detail: AiChatEvent = { docId, messages, handled: false }
  window.dispatchEvent(new CustomEvent<AiChatEvent>(AI_CHAT_EVENT, { detail }))
  if (detail.handled) return
  void (async () => {
    try {
      // If the saved chat can't be read, skip the write: saving over it would erase the history.
      const prev = await getAiChat(docId)
      await saveAiChat(docId, [...prev, ...messages].slice(-MAX_AI_CHAT_MESSAGES))
    } catch { /* chat history is best-effort */ }
  })()
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
  choice: GenerateChoice,
  topic: string,
  hooks: GenerateBlockHooks,
): Promise<NodeKey | null> {
  const { label } = choice
  const ai = new AbortController()
  hooks.aiAbortRef.current = () => ai.abort()
  hooks.setAiState({ status: 'generating', message: null, startedAt: Date.now() })

  const request: AiRequest = {
    title: topic.slice(0, 120),
    description: `Add ONE new ${label} block about: ${topic}.${choice.hint ? ` It must be ${choice.hint}.` : ''} Nothing else: no heading, no title, no intro text, and no other block.`,
    kind: 'lesson',
  }

  let got = false
  let insertedKey: NodeKey | null = null
  let failure: string | null = null
  try {
    await streamAiDocument(request, event => {
      if (got) return
      if (event.t === 'error') { failure = event.message; return }
      // Only the chosen kind counts; anything else the model sends first is skipped.
      if (event.t !== 'block' || event.block.type !== choice.type) return
      got = true
      editor.update(() => {
        try {
          const node = $createNodeFromAiBlock(event.block)
          insertedKey = node.getKey()
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

  const at = Date.now()
  const outcome: Pick<AiChatMessage, 'text' | 'status'> = got
    ? { status: 'written', text: `${label} written at the cursor.` }
    : { status: 'error', text: failure ?? (ai.signal.aborted ? 'Stopped.' : 'The AI returned nothing usable. Try again.') }
  recordInChat(hooks.docId, [
    { id: uid(), role: 'user', text: `Generate a ${label}: ${topic}`, at },
    { id: uid(), role: 'assistant', at, ...outcome },
  ])
  return got ? insertedKey : null
}
