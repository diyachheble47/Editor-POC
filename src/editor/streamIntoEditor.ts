import { $createParagraphNode, $getNodeByKey, $getRoot, $isElementNode, $parseSerializedNode } from 'lexical'
import type { LexicalEditor, NodeKey, SerializedLexicalNode } from 'lexical'
import type { StreamEvent } from '../storage/api'

/**
 * Builds a document in the editor from streamed events: text blocks are
 * opened empty and filled piece by piece (so they appear to type), other
 * blocks arrive whole. `skipped` counts blocks that couldn't be created
 * (e.g. a node type that no longer exists).
 */
export function createDocumentStreamBuilder(editor: LexicalEditor) {
  let openKey: NodeKey | null = null
  let skipped = 0
  let skippingOpenBlock = false

  const parse = (raw: Record<string, unknown>) => $parseSerializedNode(raw as unknown as SerializedLexicalNode)

  return {
    get skipped() { return skipped },
    apply(event: StreamEvent) {
      if (event.t === 'start') {
        editor.update(() => { $getRoot().clear() }, { discrete: true, tag: 'skip-scroll-into-view' })
        return
      }
      if (event.t === 'close') { openKey = null; skippingOpenBlock = false; return }
      if (event.t === 'done') {
        editor.update(() => {
          if ($getRoot().isEmpty()) $getRoot().append($createParagraphNode())
        }, { discrete: true, tag: 'skip-scroll-into-view' })
        return
      }
      editor.update(() => {
        try {
          if (event.t === 'open') {
            skippingOpenBlock = false
            const node = parse(event.node)
            $getRoot().append(node)
            openKey = node.getKey()
          } else if (event.t === 'text') {
            if (skippingOpenBlock) return
            const parent = openKey ? $getNodeByKey(openKey) : null
            if ($isElementNode(parent)) parent.append(parse(event.child))
          } else {
            $getRoot().append(parse(event.node))
          }
        } catch {
          // A text block that can't be created: skip its text pieces too,
          // and count the block once.
          if (event.t === 'open') skippingOpenBlock = true
          if (event.t !== 'text') skipped++
        }
      }, { discrete: true, tag: 'skip-scroll-into-view' })
    },
  }
}
