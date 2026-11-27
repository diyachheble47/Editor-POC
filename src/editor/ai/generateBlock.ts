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
import { ApiError, appendAiChat, generateAiBlock } from '../../storage/api'
import type { AiBlock, AiChatMessage } from '../../storage/api'
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
  // Appended on the server, so nothing already saved can be overwritten.
  void appendAiChat(docId, messages).catch(() => { /* chat history is best-effort */ })
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

  let block: AiBlock | null = null
  let insertedKey: NodeKey | null = null
  let failure: string | null = null
  try {
    block = await generateAiBlock({ type: choice.type, prompt: topic, hint: choice.hint }, ai.signal)
  } catch (err) {
    if (!ai.signal.aborted) {
      if (err instanceof ApiError && err.status === 503) {
        failure = 'The AI is not set up yet: add LITELLM_BASE_URL and LITELLM_API_KEY to backend/.env and restart the backend.'
      } else if (err instanceof ApiError && typeof err.detail === 'string') {
        failure = err.detail // "could not make that block", or the model failed
      } else {
        failure = 'Could not reach the AI service.'
      }
    }
  }
  const got = block !== null && !ai.signal.aborted
  if (block && got) {
    const made = block
    editor.update(() => {
      try {
        const node = $createNodeFromAiBlock(made)
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
