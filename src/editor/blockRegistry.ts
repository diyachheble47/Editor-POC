import type { LexicalEditor } from 'lexical'
import { $getRoot, $getSelection, $isRangeSelection, $createParagraphNode } from 'lexical'
import { $setBlocksType } from '@lexical/selection'
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text'
import { INSERT_UNORDERED_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND } from '@lexical/list'
import { $createCodeNode } from '@lexical/code-core'
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode'
import { $createEquationNode } from './nodes/EquationNode'
import { $createMolecule3DNode } from './nodes/Molecule3DNode'

export interface BlockDef {
  key: string
  label: string
  icon: string
  description: string
  category: 'text' | 'chemistry'
  insert: (editor: LexicalEditor) => void
  inSlash: boolean
  inSidebar: boolean
}

function insertWithBlocksType(
  editor: LexicalEditor,
  createNode: () => import('lexical').LexicalNode,
) {
  editor.update(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      $setBlocksType(selection, createNode)
    }
  })
}

function insertAtEnd(
  editor: LexicalEditor,
  createNode: () => import('lexical').LexicalNode,
) {
  editor.update(() => {
    let selection = $getSelection()
    if (!$isRangeSelection(selection)) {
      $getRoot().selectEnd()
      selection = $getSelection()
    }
    if ($isRangeSelection(selection)) {
      selection.insertNodes([createNode()])
    }
  })
}

export const BLOCK_REGISTRY: BlockDef[] = [
  // ── Text blocks ──────────────────────────────────────────────
  {
    key: 'paragraph',
    label: 'Text',
    icon: '¶',
    description: 'Plain text paragraph.',
    category: 'text',
    insert: (editor) => insertWithBlocksType(editor, () => $createParagraphNode()),
    inSlash: true,
    inSidebar: true,
  },
  {
    key: 'heading-1',
    label: 'Heading 1',
    icon: 'H',
    description: 'Large section heading.',
    category: 'text',
    insert: (editor) => insertWithBlocksType(editor, () => $createHeadingNode('h1')),
    inSlash: true,
    inSidebar: true,
  },
  {
    key: 'heading-2',
    label: 'Heading 2',
    icon: 'H',
    description: 'Medium section heading.',
    category: 'text',
    insert: (editor) => insertWithBlocksType(editor, () => $createHeadingNode('h2')),
    inSlash: true,
    inSidebar: false,
  },
  {
    key: 'heading-3',
    label: 'Heading 3',
    icon: 'H',
    description: 'Small section heading.',
    category: 'text',
    insert: (editor) => insertWithBlocksType(editor, () => $createHeadingNode('h3')),
    inSlash: true,
    inSidebar: false,
  },
  {
    key: 'bullet-list',
    label: 'Bullet List',
    icon: '•',
    description: 'Unordered list.',
    category: 'text',
    insert: (editor) => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined),
    inSlash: true,
    inSidebar: true,
  },
  {
    key: 'numbered-list',
    label: 'Numbered List',
    icon: '1.',
    description: 'Ordered list.',
    category: 'text',
    insert: (editor) => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined),
    inSlash: true,
    inSidebar: true,
  },
  {
    key: 'quote',
    label: 'Quote',
    icon: '"',
    description: 'Callout or blockquote.',
    category: 'text',
    insert: (editor) => insertWithBlocksType(editor, () => $createQuoteNode()),
    inSlash: true,
    inSidebar: true,
  },
  {
    key: 'code',
    label: 'Code',
    icon: '</>',
    description: 'Monospace code block.',
    category: 'text',
    insert: (editor) => insertWithBlocksType(editor, () => $createCodeNode()),
    inSlash: true,
    inSidebar: true,
  },
  {
    key: 'divider',
    label: 'Divider',
    icon: '—',
    description: 'Horizontal rule.',
    category: 'text',
    insert: (editor) => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined),
    inSlash: true,
    inSidebar: true,
  },
  // ── Chemistry blocks ─────────────────────────────────────────
  {
    key: 'equation',
    label: 'Chemical Equation',
    icon: '⚗',
    description: 'Chemistry equation, e.g. 2H₂ + O₂ → 2H₂O.',
    category: 'chemistry',
    insert: (editor) => insertAtEnd(editor, $createEquationNode),
    inSlash: true,
    inSidebar: true,
  },
  {
    key: 'molecule3d',
    label: '3D Molecule',
    icon: '🧬',
    description: 'Molecular structure visualization.',
    category: 'chemistry',
    insert: (editor) => insertAtEnd(editor, $createMolecule3DNode),
    inSlash: true,
    inSidebar: true,
  },
]
