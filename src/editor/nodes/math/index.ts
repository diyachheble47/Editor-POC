// Self-registration: importing this module wires MathNode into both the
// Lexical node list and the slash/block registry.
//
// Only the 'math' block is registered here. There used to also be a
// 'chemistry' (raw mhchem LaTeX) entry, but it opened the exact same Math
// Editor sidebar panel — trig functions (sin/cos/tan) and all — which made
// no sense labeled as chemistry and only confused things next to the real,
// guided "Chemical Equation" block (EquationNode, ../EquationNode.tsx).
// MathNode's 'chemistry' variant still exists for already-saved documents
// (see MathNode.tsx); it's just not offered as a new thing to insert.

import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { MathNode, $createMathNode, DEFAULT_MATH_LATEX } from './MathNode'

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

export { MathNode, $createMathNode, $isMathNode } from './MathNode'
export type { SerializedMathNode, MathVariant } from './MathNode'
