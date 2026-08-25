import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { Model3DNode, $createModel3DNode } from './Model3DNode'

registerNode(Model3DNode)

registerBlock({
  key: 'model-3d',
  label: '3D Model',
  icon: '🧊',
  description: 'Interactive 3D model viewer (Three.js).',
  category: 'stem',
  status: 'available',
  keywords: ['3d', 'model', 'three', 'glb', 'gltf', 'object'],
  insert: (editor) => insertDecoratorNode(editor, $createModel3DNode),
  inSlash: true,
  inSidebar: true,
})

export { Model3DNode, $createModel3DNode, $isModel3DNode, $getModel3DNodeByKey } from './Model3DNode'
export type {
  SerializedModel3DNode,
  Model3DDisplayMode,
  Model3DAnimationConfig,
  Model3DDisplayConfig,
} from './Model3DNode'
