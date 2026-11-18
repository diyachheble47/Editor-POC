// SectionNode — a heading that starts a "card": the editor draws a rounded
// panel behind everything from this heading to the next section (see
// SectionCardsPlugin). It is a Heading (level 2) in every other respect, so the
// outline, formatting and typing all work as for any heading.

import { HeadingNode } from '@lexical/rich-text'
import type { SerializedHeadingNode } from '@lexical/rich-text'
import type { EditorConfig, LexicalNode, NodeKey } from 'lexical'

export class SectionNode extends HeadingNode {
  static getType(): string { return 'section' }

  static clone(node: SectionNode): SectionNode { return new SectionNode(node.__key) }

  constructor(key?: NodeKey) { super('h2', key) }

  static importJSON(s: SerializedHeadingNode): SectionNode {
    const node = $createSectionNode()
    node.setFormat(s.format)
    node.setIndent(s.indent)
    node.setDirection(s.direction)
    return node
  }

  exportJSON(): SerializedHeadingNode {
    return { ...super.exportJSON(), type: 'section', version: 1 }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const el = super.createDOM(config)
    el.classList.add('section-heading')
    return el
  }
}

export function $createSectionNode(): SectionNode { return new SectionNode() }
export function $isSectionNode(node: LexicalNode | null | undefined): node is SectionNode { return node instanceof SectionNode }
