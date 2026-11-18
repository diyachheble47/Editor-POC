import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { TabsNode, $createTabsNode } from './TabsNode'

registerNode(TabsNode)

registerBlock({
  key: 'tabs',
  label: 'Tabs',
  icon: '⇄',
  description: 'Pills that each reveal a step or stage.',
  category: 'layout',
  status: 'available',
  keywords: ['tabs', 'steps', 'stages', 'pipeline', 'process', 'pills'],
  insert: (editor) => insertDecoratorNode(editor, () => $createTabsNode()),
  inSlash: true,
  inSidebar: true,
})

export { TabsNode, $createTabsNode, $isTabsNode } from './TabsNode'
export type { TabItem } from './TabsNode'
