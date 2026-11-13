// Self-registration: importing this module wires GraphNode into both the
// Lexical node list and the slash/block registry.

import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { GraphNode, $createGraphNode } from './GraphNode'

registerNode(GraphNode)

registerBlock({
  key: 'graph',
  label: 'Graph',
  icon: '📈',
  description: 'Coordinate plane — plot points, connect them, or plot a function.',
  category: 'stem',
  status: 'available',
  keywords: ['graph', 'coordinate', 'plane', 'points', 'plot', 'function', 'geometry', 'xy'],
  insert: (editor) => insertDecoratorNode(editor, () => $createGraphNode()),
  inSlash: true,
  inSidebar: true,
})

export { GraphNode, $createGraphNode, $isGraphNode } from './GraphNode'
export type { SerializedGraphNode, GraphPoint, GraphEdge } from './GraphNode'
