// Self-registration: importing this module wires GeometryNode into both
// the Lexical node list and the slash/block registry.

import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { GeometryNode, $createGeometryNode } from './GeometryNode'

registerNode(GeometryNode)

registerBlock({
  key: 'geometry',
  label: 'Geometry',
  icon: '📐',
  description: 'Points, segments, lines, rays, angles, and polygons.',
  category: 'stem',
  status: 'available',
  keywords: ['geometry', 'point', 'line', 'ray', 'segment', 'angle', 'polygon', 'shape'],
  insert: (editor) => insertDecoratorNode(editor, () => $createGeometryNode()),
  inSlash: true,
  inSidebar: true,
})

export { GeometryNode, $createGeometryNode, $isGeometryNode } from './GeometryNode'
export type { SerializedGeometryNode, GeoPoint, GeoEdge, GeoAngle, GeoPolygon, EdgeKind } from './GeometryNode'
