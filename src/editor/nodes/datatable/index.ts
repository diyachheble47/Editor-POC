import { registerNode } from '../../nodeRegistry'
import { registerBlock } from '../../blockRegistry'
import { DataTableNode } from './DataTableNode'
import { OPEN_DATATABLE_PICKER_COMMAND } from './DataTablePickerPlugin'

registerNode(DataTableNode)

registerBlock({
  key: 'datatable',
  label: 'Table',
  icon: '▦',
  description: 'A clean table with a header row.',
  category: 'basic',
  status: 'available',
  keywords: ['table', 'grid', 'rows', 'columns', 'comparison'],
  insert: (editor) => { editor.dispatchCommand(OPEN_DATATABLE_PICKER_COMMAND, undefined) },
  inSlash: true,
  inSidebar: true,
})

export { DataTableNode, $createDataTableNode, $isDataTableNode } from './DataTableNode'
export { DataTablePickerPlugin, OPEN_DATATABLE_PICKER_COMMAND } from './DataTablePickerPlugin'
