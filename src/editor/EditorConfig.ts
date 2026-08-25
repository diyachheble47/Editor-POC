// Importing customNodes triggers all self-registrations (registerNode calls).
// This must be the first import so the registry is populated before we read it.
import './customNodes'

import type { InitialConfigType } from '@lexical/react/LexicalComposer'
import { EquationNode } from './nodes/EquationNode'
import { Molecule3DNode } from './nodes/Molecule3DNode'
import { CORE_NODES, getRegisteredNodes } from './nodeRegistry'

export const editorConfig: InitialConfigType = {
  namespace: 'teacher-notebook',
  nodes: [
    ...CORE_NODES,
    // Legacy STEM nodes (pre-date the registry pattern — will be migrated in a future prompt)
    EquationNode,
    Molecule3DNode,
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
