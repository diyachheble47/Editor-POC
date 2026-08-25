import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { ExcalidrawNode, $createExcalidrawNode } from './ExcalidrawNode'

registerNode(ExcalidrawNode)

registerBlock({
  key: 'excalidraw',
  label: 'Drawing',
  icon: '✏️',
  description: 'Excalidraw whiteboard / diagram.',
  category: 'stem',
  status: 'available',
  keywords: ['draw', 'diagram', 'whiteboard', 'excalidraw', 'sketch', 'flowchart'],
  insert: (editor) => insertDecoratorNode(editor, $createExcalidrawNode),
  inSlash: true,
  inSidebar: true,
})

export { ExcalidrawNode, $createExcalidrawNode, $isExcalidrawNode, $getExcalidrawNodeByKey } from './ExcalidrawNode'
export type { SerializedExcalidrawNode } from './ExcalidrawNode'
