// Self-registration: importing this module wires MathNode into both the
// Lexical node list and the slash/block registry. Two blocks are registered:
//   - 'math'      → LaTeX equation (/math slash command)
//   - 'chemistry' → mhchem \ce{...} equation (/chemistry slash command)

import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { MathNode, $createMathNode, DEFAULT_MATH_LATEX, DEFAULT_CHEM_LATEX } from './MathNode'

registerNode(MathNode)

registerBlock({
  key: 'math',
  label: 'Math',
  icon: '∑',
  description: 'LaTeX math equation, rendered with KaTeX.',
  category: 'stem',
  status: 'available',
  keywords: ['math', 'latex', 'equation', 'formula', 'expression'],
  insert: (editor) => insertDecoratorNode(editor, () => $createMathNode(DEFAULT_MATH_LATEX, true, 'math')),
  inSlash: true,
  inSidebar: true,
})

registerBlock({
  key: 'chemistry',
  label: 'Chemistry',
  icon: '⚗',
  description: 'Chemistry equation using \\ce{} mhchem notation.',
  category: 'stem',
  status: 'available',
  keywords: ['chemistry', 'chemical', 'equation', 'reaction', 'mhchem', 'ce'],
  insert: (editor) => insertDecoratorNode(editor, () => $createMathNode(DEFAULT_CHEM_LATEX, true, 'chemistry')),
  inSlash: true,
  inSidebar: true,
})

export { MathNode, $createMathNode, $isMathNode } from './MathNode'
export type { SerializedMathNode, MathVariant } from './MathNode'
