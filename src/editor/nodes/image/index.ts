// Self-registration: importing this module wires ImageNode into the editor's
// node list and the slash menu.
import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { ImageNode, $createImageNode, pickImageFile, storeImageFile } from './ImageNode'

registerNode(ImageNode)

registerBlock({
  key: 'image',
  label: 'Image',
  icon: '🖼',
  description: 'Upload a JPEG, PNG, WebP, GIF or SVG.',
  category: 'media',
  status: 'available',
  keywords: ['image', 'photo', 'picture', 'upload', 'media'],
  // Straight to the file picker; nothing is inserted if it is cancelled.
  insert: (editor) => {
    void pickImageFile()
      .then(file => (file ? storeImageFile(file) : null))
      .then(img => { if (img) insertDecoratorNode(editor, () => $createImageNode(img.src, img.alt)) })
      .catch(() => {})
  },
  inSlash: true,
  inSidebar: true,
})

export { ImageNode, $createImageNode, $isImageNode } from './ImageNode'
export type { SerializedImageNode } from './ImageNode'
