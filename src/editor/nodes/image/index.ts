// Legacy image node: registered only so older documents still load. New
// images are created by the Media blocks (nodes/media).
import { registerNode } from '../../nodeRegistry'
import { ImageNode } from './ImageNode'

registerNode(ImageNode)

export { ImageNode, $createImageNode, $isImageNode } from './ImageNode'
export type { SerializedImageNode } from './ImageNode'
