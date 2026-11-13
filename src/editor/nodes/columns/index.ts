import { registerNode } from '../../nodeRegistry'
import { registerBlock } from '../../blockRegistry'
import { ColumnsContainerNode, ColumnNode, insertColumnsBlock } from './ColumnsNode'

registerNode(ColumnsContainerNode)
registerNode(ColumnNode)

registerBlock({
  key: 'columns-2',
  label: '2 Columns',
  icon: '▥',
  description: 'Two side-by-side text columns.',
  category: 'layout',
  status: 'available',
  keywords: ['columns', 'layout', 'side by side', 'two column'],
  insert: (editor) => insertColumnsBlock(editor, 2),
  inSlash: true,
  inSidebar: true,
})

registerBlock({
  key: 'columns-3',
  label: '3 Columns',
  icon: '▦',
  description: 'Three side-by-side text columns.',
  category: 'layout',
  status: 'available',
  keywords: ['columns', 'layout', 'side by side', 'three column'],
  insert: (editor) => insertColumnsBlock(editor, 3),
  inSlash: true,
  inSidebar: true,
})

export {
  ColumnsContainerNode,
  ColumnNode,
  $createColumnsContainerNode,
  $createColumnNode,
  $isColumnsContainerNode,
  $isColumnNode,
  insertColumnsBlock,
} from './ColumnsNode'
