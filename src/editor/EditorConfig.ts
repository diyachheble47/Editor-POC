// Importing customNodes triggers all self-registrations (registerNode calls).
// This must be the first import so the registry is populated before we read it.
import './customNodes'

import type { InitialConfigType } from '@lexical/react/LexicalComposer'
import { EquationNode } from './nodes/EquationNode'
import { CORE_NODES, getRegisteredNodes } from './nodeRegistry'

export const editorConfig: InitialConfigType = {
  namespace: 'teacher-notebook',
  nodes: [
    ...CORE_NODES,
    // Legacy STEM node (pre-dates the registry pattern — will be migrated in a future prompt)
    EquationNode,
    // Custom nodes registered via registerNode() — populated by customNodes.ts imports
    ...getRegisteredNodes(),
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
    // There is no other table feature in this app — every Lexical table is
    // a matrix, so it's always themed with bracket styling (see .matrix-*
    // rules in App.css) rather than needing a separate node type.
    table: 'matrix-table',
    tableRow: 'matrix-row',
    tableCell: 'matrix-cell',
    code: 'editor-code',
    codeHighlight: {
      atrule: 'editor-tokenAttr',
      attr: 'editor-tokenAttr',
      boolean: 'editor-tokenProperty',
      builtin: 'editor-tokenSelector',
      cdata: 'editor-tokenComment',
      char: 'editor-tokenSelector',
      class: 'editor-tokenFunction',
      'class-name': 'editor-tokenFunction',
      comment: 'editor-tokenComment',
      constant: 'editor-tokenProperty',
      deleted: 'editor-tokenProperty',
      doctype: 'editor-tokenComment',
      entity: 'editor-tokenOperator',
      function: 'editor-tokenFunction',
      important: 'editor-tokenVariable',
      inserted: 'editor-tokenSelector',
      keyword: 'editor-tokenAttr',
      namespace: 'editor-tokenVariable',
      number: 'editor-tokenProperty',
      operator: 'editor-tokenOperator',
      prolog: 'editor-tokenComment',
      property: 'editor-tokenProperty',
      punctuation: 'editor-tokenPunctuation',
      regex: 'editor-tokenVariable',
      selector: 'editor-tokenSelector',
      string: 'editor-tokenSelector',
      symbol: 'editor-tokenProperty',
      tag: 'editor-tokenProperty',
      url: 'editor-tokenOperator',
      variable: 'editor-tokenVariable',
    },
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
