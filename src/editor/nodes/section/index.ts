import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertWithBlocksType } from '../../blockRegistry'
import { SectionNode, $createSectionNode } from './SectionNode'

registerNode(SectionNode)

registerBlock({
  key: 'section',
  label: 'Section',
  icon: '▭',
  description: 'A heading that puts what follows in a card.',
  category: 'layout',
  status: 'available',
  keywords: ['section', 'card', 'panel', 'chapter', 'part'],
  insert: (editor) => insertWithBlocksType(editor, () => $createSectionNode()),
  inSlash: true,
  inSidebar: false,
})

export { SectionNode, $createSectionNode, $isSectionNode } from './SectionNode'
