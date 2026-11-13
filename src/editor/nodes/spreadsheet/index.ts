// Self-registration: importing this module wires SpreadsheetNode into both
// the Lexical node list and the slash/block registry.

import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { SpreadsheetNode, $createSpreadsheetNode } from './SpreadsheetNode'

registerNode(SpreadsheetNode)

registerBlock({
  key: 'spreadsheet',
  label: 'Spreadsheet',
  icon: '▦',
  description: 'A grid with formulas — e.g. =SUM(A1:A3), =A1+B1.',
  category: 'basic',
  status: 'available',
  keywords: ['spreadsheet', 'sheet', 'table', 'grid', 'formula', 'excel', 'sum', 'data'],
  insert: (editor) => insertDecoratorNode(editor, () => $createSpreadsheetNode()),
  inSlash: true,
  inSidebar: true,
})

export { SpreadsheetNode, $createSpreadsheetNode, $isSpreadsheetNode } from './SpreadsheetNode'
export type { SerializedSpreadsheetNode } from './SpreadsheetNode'
