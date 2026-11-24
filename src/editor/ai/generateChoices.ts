import type { AiBlock } from '../../storage/api'

/** One thing the slash menu's "Generate" can make: exactly one block of `type`. */
export interface GenerateChoice {
  label: string
  type: AiBlock['type']
  /** Tells the model what to make when two choices share a block type. */
  hint?: string
}

export const GENERATE_CHOICES: GenerateChoice[] = [
  { label: 'Drawing', type: 'drawing', hint: 'a labelled diagram drawn with rectangles, ellipses, arrows and text' },
  { label: 'Table', type: 'table' },
  { label: 'Spreadsheet', type: 'table', hint: 'a table where some cells are = formulas that calculate from other cells' },
  { label: 'Quiz', type: 'quiz' },
  { label: 'HTML activity', type: 'html', hint: 'an interactive, self-contained page such as a simulation, a game or a poll' },
  { label: 'Chemical equation', type: 'equation', hint: 'a balanced chemical reaction' },
  { label: 'Math formula', type: 'math', hint: 'a maths or physics formula' },
  { label: 'Graph', type: 'graph' },
  { label: 'Geometry', type: 'geometry' },
  { label: 'Molecule', type: 'molecule' },
  { label: 'Circuit', type: 'circuit' },
  { label: 'Matrix', type: 'matrix' },
  { label: 'Flowchart', type: 'flowchart' },
  { label: 'Chart', type: 'chart' },
]
