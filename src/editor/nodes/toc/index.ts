import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { TocNode, $createTocNode } from './TocNode'

registerNode(TocNode)

registerBlock({
  key: 'toc',
  label: 'Contents',
  icon: '☰',
  description: 'Chips that jump to each section.',
  category: 'layout',
  status: 'available',
  keywords: ['contents', 'toc', 'navigation', 'chips', 'index', 'links'],
  insert: (editor) => insertDecoratorNode(editor, () => $createTocNode()),
  inSlash: true,
  inSidebar: true,
})

export { TocNode, $createTocNode, $isTocNode } from './TocNode'
