import type { InitialConfigType } from '@lexical/react/LexicalComposer'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ListNode, ListItemNode } from '@lexical/list'
import { CodeNode, CodeHighlightNode } from '@lexical/code-core'
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode'
import { EquationNode } from './nodes/EquationNode'
import { Molecule3DNode } from './nodes/Molecule3DNode'

export const editorConfig: InitialConfigType = {
  namespace: 'teacher-notebook',
  nodes: [
    // Core text structure
    HeadingNode,
    QuoteNode,
    ListNode,
    ListItemNode,
    CodeNode,
    CodeHighlightNode,
    HorizontalRuleNode,
    // Custom domain nodes
    EquationNode,
    Molecule3DNode,
  ],
  onError(error: Error) {
    throw error
  },
  theme: {
    paragraph: 'editor-paragraph',
    heading: {
      h1: 'editor-heading-h1',
      h2: 'editor-heading-h2',
      h3: 'editor-heading-h3',
    },
    quote: 'editor-quote',
    code: 'editor-code',
    list: {
      ul: 'editor-list-ul',
      ol: 'editor-list-ol',
      listitem: 'editor-listitem',
      nested: {
        listitem: 'editor-listitem-nested',
      },
    },
    text: {
      bold: 'editor-text-bold',
      italic: 'editor-text-italic',
      underline: 'editor-text-underline',
      strikethrough: 'editor-text-strikethrough',
      code: 'editor-text-code',
      underlineStrikethrough: 'editor-text-underline editor-text-strikethrough',
    },
  },
}
