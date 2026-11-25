// Self-registration: MediaNode + the slash-menu items under the "Media"
// heading. Image / Video / Audio open the file picker straight away; YouTube /
// Embed insert a small block that asks for a link.
import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { MediaNode, $createMediaNode } from './MediaNode'
import { pickAndStoreMedia } from './mediaFiles'
import type { UploadKind } from './mediaFiles'

registerNode(MediaNode)

function fileBlock(kind: UploadKind, label: string, icon: string, description: string, keywords: string[]) {
  registerBlock({
    key: kind,
    label,
    icon,
    description,
    category: 'media',
    status: 'available',
    keywords,
    insert: editor => {
      void pickAndStoreMedia(kind)
        .then(p => { if (p) insertDecoratorNode(editor, () => $createMediaNode(p.kind, p.src, p.alt)) })
        .catch(() => {})
    },
    inSlash: true,
    inSidebar: true,
  })
}

function linkBlock(key: string, kind: 'youtube' | 'embed', label: string, icon: string, description: string, keywords: string[]) {
  registerBlock({
    key,
    label,
    icon,
    description,
    category: 'media',
    status: 'available',
    keywords,
    insert: editor => insertDecoratorNode(editor, () => $createMediaNode(kind)),
    inSlash: true,
    inSidebar: true,
  })
}

fileBlock('image', 'Image', '🖼', 'Upload a JPEG, PNG, WebP, GIF or SVG.', ['image', 'photo', 'picture', 'upload'])
fileBlock('video', 'Video', '🎥', 'Upload an MP4, WebM or OGG video (up to 10 MB).', ['video', 'movie', 'clip', 'mp4', 'upload'])
fileBlock('audio', 'Audio', '🔊', 'Upload an MP3 or WAV file (up to 10 MB).', ['audio', 'sound', 'music', 'mp3', 'wav', 'upload'])
linkBlock('youtube', 'youtube', 'YouTube', '▶', 'Paste a YouTube or Vimeo link.', ['youtube', 'vimeo', 'video', 'link'])
linkBlock('embed', 'embed', 'Embed', '</>', 'Paste a link or iframe code.', ['embed', 'iframe', 'link', 'website', 'page'])

export { MediaNode, $createMediaNode, $isMediaNode } from './MediaNode'
export type { SerializedMediaNode } from './MediaNode'
