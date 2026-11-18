import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { DataTableNode, $createDataTableNode } from './DataTableNode'

registerNode(DataTableNode)

registerBlock({
  key: 'datatable',
  label: 'Table',
  icon: '▦',
  description: 'A clean table with a header row.',
  category: 'basic',
  status: 'available',
  keywords: ['table', 'grid', 'rows', 'columns', 'comparison'],
  insert: (editor) => insertDecoratorNode(editor, () => $createDataTableNode()),
  inSlash: true,
  inSidebar: true,
})

export { DataTableNode, $createDataTableNode, $isDataTableNode } from './DataTableNode'
