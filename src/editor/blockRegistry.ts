import type { LexicalEditor } from 'lexical'
import { $getRoot, $getSelection, $isRangeSelection, $createParagraphNode } from 'lexical'
import type { ElementNode } from 'lexical'
import { $setBlocksType } from '@lexical/selection'
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text'
import { INSERT_UNORDERED_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND } from '@lexical/list'
import { $createCodeNode } from '@lexical/code-core'
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode'
import { $createEquationNode } from './nodes/EquationNode'
import { $createMolecule3DNode } from './nodes/Molecule3DNode'

export type BlockCategory = 'basic' | 'media' | 'stem' | 'education' | 'ai'
export type BlockStatus = 'available' | 'coming-soon'

export interface BlockDef {
  key: string
  label: string
  icon: string
  description: string
  category: BlockCategory
  status: BlockStatus
  keywords?: string[]
  insert: (editor: LexicalEditor) => void
  inSlash: boolean
  inSidebar: boolean
}

function insertWithBlocksType(
  editor: LexicalEditor,
  createNode: () => ElementNode,
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

/**
 * Shared insertion helper for decorator (non-text) nodes.
 * Inserts at the cursor if there is a range selection, otherwise appends at
 * the document end. Custom node registrations should use this rather than
 * duplicating the logic.
 */
export function insertDecoratorNode(
  editor: LexicalEditor,
  createNode: () => import('lexical').LexicalNode,
): void {
  insertAtEnd(editor, createNode)
}

export const BLOCK_REGISTRY: BlockDef[] = [

  // ── BASIC ────────────────────────────────────────────────────
  {
    key: 'paragraph',
    label: 'Text',
    icon: '¶',
    description: 'Plain text paragraph.',
    category: 'basic',
    status: 'available',
    keywords: ['text', 'paragraph', 'plain'],
    insert: (editor) => insertWithBlocksType(editor, () => $createParagraphNode()),
    inSlash: true,
    inSidebar: true,
  },
  {
    key: 'heading-1',
    label: 'Heading 1',
    icon: 'H₁',
    description: 'Large section heading.',
    category: 'basic',
    status: 'available',
    keywords: ['heading', 'h1', 'title'],
    insert: (editor) => insertWithBlocksType(editor, () => $createHeadingNode('h1')),
    inSlash: true,
    inSidebar: true,
  },
  {
    key: 'heading-2',
    label: 'Heading 2',
    icon: 'H₂',
    description: 'Medium section heading.',
    category: 'basic',
    status: 'available',
    keywords: ['heading', 'h2'],
    insert: (editor) => insertWithBlocksType(editor, () => $createHeadingNode('h2')),
    inSlash: true,
    inSidebar: false,
  },
  {
    key: 'heading-3',
    label: 'Heading 3',
    icon: 'H₃',
    description: 'Small section heading.',
    category: 'basic',
    status: 'available',
    keywords: ['heading', 'h3'],
    insert: (editor) => insertWithBlocksType(editor, () => $createHeadingNode('h3')),
    inSlash: true,
    inSidebar: false,
  },
  {
    key: 'bullet-list',
    label: 'Bullet List',
    icon: '•',
    description: 'Unordered list.',
    category: 'basic',
    status: 'available',
    keywords: ['bullet', 'list', 'unordered'],
    insert: (editor) => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined),
    inSlash: true,
    inSidebar: true,
  },
  {
    key: 'numbered-list',
    label: 'Numbered List',
    icon: '1.',
    description: 'Ordered list.',
    category: 'basic',
    status: 'available',
    keywords: ['numbered', 'ordered', 'list'],
    insert: (editor) => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined),
    inSlash: true,
    inSidebar: true,
  },
  {
    key: 'quote',
    label: 'Quote',
    icon: '"',
    description: 'Callout or blockquote.',
    category: 'basic',
    status: 'available',
    keywords: ['quote', 'blockquote'],
    insert: (editor) => insertWithBlocksType(editor, () => $createQuoteNode()),
    inSlash: true,
    inSidebar: true,
  },
  {
    key: 'callout',
    label: 'Callout',
    icon: '💡',
    description: 'Highlighted note or tip.',
    category: 'basic',
    status: 'coming-soon',
    keywords: ['callout', 'note', 'tip', 'info'],
    insert: () => {},
    inSlash: true,
    inSidebar: false,
  },
  {
    key: 'code',
    label: 'Code',
    icon: '</>',
    description: 'Monospace code block.',
    category: 'basic',
    status: 'available',
    keywords: ['code', 'monospace', 'snippet'],
    insert: (editor) => insertWithBlocksType(editor, () => $createCodeNode()),
    inSlash: true,
    inSidebar: true,
  },
  {
    key: 'divider',
    label: 'Divider',
    icon: '—',
    description: 'Horizontal rule.',
    category: 'basic',
    status: 'available',
    keywords: ['divider', 'rule', 'separator', 'hr'],
    insert: (editor) => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined),
    inSlash: true,
    inSidebar: true,
  },

  // ── MEDIA ────────────────────────────────────────────────────
  {
    key: 'image',
    label: 'Image',
    icon: '🖼',
    description: 'JPEG, PNG, WebP, SVG.',
    category: 'media',
    status: 'coming-soon',
    keywords: ['image', 'photo', 'picture'],
    insert: () => {},
    inSlash: true,
    inSidebar: false,
  },
  {
    key: 'video',
    label: 'Video',
    icon: '🎥',
    description: 'MP4 or WebM video.',
    category: 'media',
    status: 'coming-soon',
    keywords: ['video', 'movie', 'clip'],
    insert: () => {},
    inSlash: true,
    inSidebar: false,
  },
  {
    key: 'audio',
    label: 'Audio',
    icon: '🔊',
    description: 'MP3, WAV, OGG audio.',
    category: 'media',
    status: 'coming-soon',
    keywords: ['audio', 'sound', 'music'],
    insert: () => {},
    inSlash: true,
    inSidebar: false,
  },
  {
    key: 'file',
    label: 'File',
    icon: '📎',
    description: 'Any file attachment.',
    category: 'media',
    status: 'coming-soon',
    keywords: ['file', 'attachment', 'upload'],
    insert: () => {},
    inSlash: true,
    inSidebar: false,
  },

  // ── STEM ─────────────────────────────────────────────────────
  {
    key: 'equation',
    label: 'Chemical Equation',
    icon: '⚗',
    description: 'Chemistry equation, e.g. 2H₂ + O₂ → 2H₂O.',
    category: 'stem',
    status: 'available',
    keywords: ['equation', 'chemistry', 'chemical', 'formula', 'reaction'],
    insert: (editor) => insertAtEnd(editor, $createEquationNode),
    inSlash: true,
    inSidebar: true,
  },
  {
    key: 'molecule3d',
    label: '3D Molecule',
    icon: '🧬',
    description: 'Molecular structure visualization.',
    category: 'stem',
    status: 'available',
    keywords: ['molecule', '3d', 'structure', 'chemistry', 'model'],
    insert: (editor) => insertAtEnd(editor, $createMolecule3DNode),
    inSlash: true,
    inSidebar: true,
  },
  {
    key: 'excalidraw',
    label: 'Drawing',
    icon: '✏️',
    description: 'Excalidraw whiteboard / diagram.',
    category: 'stem',
    status: 'coming-soon',
    keywords: ['draw', 'diagram', 'whiteboard', 'excalidraw'],
    insert: () => {},
    inSlash: true,
    inSidebar: false,
  },
  {
    key: 'diagram',
    label: 'Diagram',
    icon: '📊',
    description: 'Concept map or flowchart.',
    category: 'stem',
    status: 'coming-soon',
    keywords: ['diagram', 'chart', 'flowchart', 'concept'],
    insert: () => {},
    inSlash: true,
    inSidebar: false,
  },
  {
    key: 'model-3d',
    label: '3D Model',
    icon: '🧊',
    description: 'Interactive 3D model viewer.',
    category: 'stem',
    status: 'coming-soon',
    keywords: ['3d', 'model', 'three'],
    insert: () => {},
    inSlash: true,
    inSidebar: false,
  },

  // ── EDUCATION ────────────────────────────────────────────────
  {
    key: 'example',
    label: 'Example',
    icon: '📖',
    description: 'Worked example block.',
    category: 'education',
    status: 'coming-soon',
    keywords: ['example', 'worked', 'solution'],
    insert: () => {},
    inSlash: true,
    inSidebar: false,
  },
  {
    key: 'question',
    label: 'Question',
    icon: '❓',
    description: 'Practice question.',
    category: 'education',
    status: 'coming-soon',
    keywords: ['question', 'practice', 'exercise'],
    insert: () => {},
    inSlash: true,
    inSidebar: false,
  },
  {
    key: 'quiz',
    label: 'Quiz',
    icon: '✅',
    description: 'Multiple-choice quiz.',
    category: 'education',
    status: 'coming-soon',
    keywords: ['quiz', 'multiple', 'choice', 'test'],
    insert: () => {},
    inSlash: true,
    inSidebar: false,
  },
  {
    key: 'flashcard',
    label: 'Flashcard',
    icon: '🃏',
    description: 'Flip-card for recall practice.',
    category: 'education',
    status: 'coming-soon',
    keywords: ['flashcard', 'flip', 'recall'],
    insert: () => {},
    inSlash: true,
    inSidebar: false,
  },

  // ── AI ───────────────────────────────────────────────────────
  {
    key: 'ai-generate',
    label: 'Generate',
    icon: '✦',
    description: 'AI-generated content block.',
    category: 'ai',
    status: 'coming-soon',
    keywords: ['generate', 'ai', 'create'],
    insert: () => {},
    inSlash: true,
    inSidebar: false,
  },
  {
    key: 'ai-explain',
    label: 'Explain',
    icon: '✎',
    description: 'AI explanation of selected text.',
    category: 'ai',
    status: 'coming-soon',
    keywords: ['explain', 'ai'],
    insert: () => {},
    inSlash: true,
    inSidebar: false,
  },
  {
    key: 'ai-summarize',
    label: 'Summarize',
    icon: '≡',
    description: 'AI summary of the document.',
    category: 'ai',
    status: 'coming-soon',
    keywords: ['summarize', 'summary', 'ai'],
    insert: () => {},
    inSlash: true,
    inSidebar: false,
  },
  {
    key: 'ai-example',
    label: 'Create Example',
    icon: '✩',
    description: 'AI-generated worked example.',
    category: 'ai',
    status: 'coming-soon',
    keywords: ['example', 'ai', 'generate'],
    insert: () => {},
    inSlash: true,
    inSidebar: false,
  },
  {
    key: 'ai-quiz',
    label: 'Create Quiz',
    icon: '⚡',
    description: 'AI-generated quiz from selection.',
    category: 'ai',
    status: 'coming-soon',
    keywords: ['quiz', 'ai', 'generate'],
    insert: () => {},
    inSlash: true,
    inSidebar: false,
  },
]

export const CATEGORY_ORDER: BlockCategory[] = ['basic', 'media', 'stem', 'education', 'ai']

export const CATEGORY_LABELS: Record<BlockCategory, string> = {
  basic: 'Basic',
  media: 'Media',
  stem: 'STEM',
  education: 'Education',
  ai: 'AI',
}

// ── Registration API ──────────────────────────────────────────────
// Use these instead of mutating BLOCK_REGISTRY directly.

export function registerBlock(def: BlockDef): void {
  const exists = BLOCK_REGISTRY.findIndex(b => b.key === def.key)
  if (exists !== -1) {
    BLOCK_REGISTRY[exists] = def
  } else {
    BLOCK_REGISTRY.push(def)
  }
}

// Slash-only alias: marks the block as slash-menu only (not sidebar).
export function registerSlashCommand(def: Omit<BlockDef, 'inSidebar'>): void {
  registerBlock({ ...def, inSidebar: false })
}

// Placeholder for future tool registration (AI tools, integrations, etc.).
// Shape will expand as the tool system is defined.
export interface ToolDef {
  key: string
  label: string
  description: string
  category: BlockCategory
}

const TOOL_REGISTRY: ToolDef[] = []

export function registerTool(def: ToolDef): void {
  const exists = TOOL_REGISTRY.findIndex(t => t.key === def.key)
  if (exists !== -1) {
    TOOL_REGISTRY[exists] = def
  } else {
    TOOL_REGISTRY.push(def)
  }
}

export function getTools(): readonly ToolDef[] {
  return TOOL_REGISTRY
}
