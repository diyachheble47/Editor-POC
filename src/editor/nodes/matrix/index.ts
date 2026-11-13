// Self-registration: the Matrix block is a real Lexical table
// (@lexical/table's TableNode/TableRowNode/TableCellNode) styled to look
// like a math matrix, not a custom DecoratorNode. That means cell editing,
// keyboard navigation, selection, and copy/paste all come from Lexical's
// own table handling for free — this file only wires up the block-registry
// entry and the node classes.
//
// Clicking "Matrix" dispatches OPEN_MATRIX_PICKER_COMMAND rather than
// inserting directly, so the size-picker (MatrixPickerPlugin) can ask the
// user for rows × cols first, then hand off to Lexical's own
// INSERT_TABLE_COMMAND to do the actual insert.

import { TableNode, TableRowNode, TableCellNode } from '@lexical/table'
import { registerNode } from '../../nodeRegistry'
import { registerBlock } from '../../blockRegistry'
import { OPEN_MATRIX_PICKER_COMMAND } from './MatrixPickerPlugin'

registerNode(TableNode)
registerNode(TableRowNode)
registerNode(TableCellNode)

registerBlock({
  key: 'matrix',
  label: 'Matrix',
  icon: '▦',
  description: 'Pick a size, then edit each cell — e.g. for linear algebra.',
  category: 'stem',
  status: 'available',
  keywords: ['matrix', 'table', 'grid', 'linear algebra', 'vector', 'array'],
  insert: (editor) => editor.dispatchCommand(OPEN_MATRIX_PICKER_COMMAND, undefined),
  inSlash: true,
  inSidebar: true,
})

export { MatrixPickerPlugin, OPEN_MATRIX_PICKER_COMMAND } from './MatrixPickerPlugin'
export { MatrixControlsPlugin } from './MatrixControlsPlugin'
