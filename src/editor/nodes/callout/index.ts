// Self-registration: importing this module is the only step needed to make
// CalloutNode available in the editor and slash menu.
//
// Steps executed on import:
//   1. registerNode(CalloutNode)  — adds it to the Lexical node list
//   2. registerBlock(...)         — upserts the slash menu entry (marks it available,
//                                   replacing the coming-soon placeholder in BLOCK_REGISTRY)

import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { CalloutNode, $createCalloutNode } from './CalloutNode'

registerNode(CalloutNode)

registerBlock({
  key: 'callout',
  label: 'Callout',
  icon: '💡',
  description: 'Highlighted note, tip, warning, or caution.',
  category: 'basic',
  status: 'available',
  keywords: ['callout', 'note', 'tip', 'info', 'warning', 'caution'],
  insert: (editor) => insertDecoratorNode(editor, () => $createCalloutNode('info')),
  inSlash: true,
  inSidebar: true,
})

export { CalloutNode, $createCalloutNode } from './CalloutNode'
export type { SerializedCalloutNode, CalloutVariant } from './CalloutNode'
