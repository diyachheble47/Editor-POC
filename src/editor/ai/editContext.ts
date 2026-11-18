// What the AI sees of the document when asked to edit it, and how its answer
// is put back. The document becomes numbered text blocks ("#3 paragraph: ...").
// Blocks the AI can't rewrite as text (graphs, images, 3D, circuits...) are
// listed as "[kept: type]" so it can only keep or drop them; keeping one means
// the original node is rebuilt from its saved JSON, so nothing is lost.

import { $getRoot, $isElementNode } from 'lexical'
import type { LexicalEditor, SerializedLexicalNode } from 'lexical'
import { $isHeadingNode, $isQuoteNode } from '@lexical/rich-text'
import { $isListNode } from '@lexical/list'
import { $isCodeNode } from '@lexical/code-core'

export interface EditContext {
  /** Numbered blocks, as sent to the AI. */
  text: string
  /** Original serialized block N, rebuilt when the AI answers {"type":"keep","ref":N}. */
  originals: SerializedLexicalNode[]
  /** Too long to send whole. Editing a cut-off copy would delete the rest, so it is refused. */
  tooLong: boolean
}

const MAX_CHARS = 30000
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t)

/** True when the document has nothing but empty paragraphs. */
export function isDocEmpty(editor: LexicalEditor): boolean {
  return editor.getEditorState().read(() =>
    $getRoot().getChildren().every(c => c.getType() === 'paragraph' && c.getTextContent().trim() === ''))
}

function describe(json: Record<string, unknown>, textOf: () => string, node: unknown): string | null {
  const type = String(json.type)
  if (type === 'section') return `section: ${textOf()}`
  if (type === 'datatable' && Array.isArray(json.rows)) {
    return `table: ${(json.rows as unknown[]).map(r => (Array.isArray(r) ? r.join(' | ') : '')).join(' // ')}`
  }
  if ($isHeadingNode(node as never)) return `heading(${String(json.tag ?? 'h2').slice(1)}): ${textOf()}`
  if ($isListNode(node as never)) {
    const ordered = (json as { listType?: string }).listType === 'number'
    const items = ((node as { getChildren: () => { getTextContent: () => string }[] }).getChildren()).map(i => i.getTextContent())
    return `${ordered ? 'numbered' : 'bullets'}: ${items.join(' | ')}`
  }
  if ($isQuoteNode(node as never)) return `quote: ${textOf()}`
  if ($isCodeNode(node as never)) return `code: ${textOf()}`
  if (type === 'paragraph') return textOf().trim() ? `paragraph: ${textOf()}` : null
  if (type === 'callout') return `callout(${String(json.variant)}): ${String(json.body ?? '')}`
  if (type === 'spreadsheet') {
    const cells = json.cells
    if (Array.isArray(cells)) return `table: ${cells.map(r => (Array.isArray(r) ? r.join(' | ') : '')).join(' // ')}`
  }
  return null
}

/** `keys`: only these top-level blocks (a selection); omitted = the whole document. */
export function buildEditContext(editor: LexicalEditor, keys?: readonly string[]): EditContext {
  const lines: string[] = []
  const originals: SerializedLexicalNode[] = []
  const state = editor.getEditorState()
  const serialized = state.toJSON().root.children
  state.read(() => {
    $getRoot().getChildren().forEach((child, index) => {
      if (keys && !keys.includes(child.getKey())) return
      const json = child.exportJSON() as unknown as Record<string, unknown>
      const textOf = () => child.getTextContent()
      const line = describe(json, textOf, child)
      // Empty spacer paragraphs are not worth sending (or keeping).
      if (line === null && json.type === 'paragraph') return
      originals.push(serialized[index])
      const n = originals.length - 1
      if (line !== null) { lines.push(`#${n} ${clip(line, 2000)}`); return }
      const hint = $isElementNode(child) ? '' : clip(textOf(), 60)
      lines.push(`#${n} [kept: ${String(json.type)}${hint ? ` "${hint}"` : ''}]`)
    })
  })
  const text = lines.join('\n')
  return { text, originals, tooLong: text.length > MAX_CHARS }
}
