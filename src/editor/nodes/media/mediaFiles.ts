// Uploaded media files: what is allowed, picking one, and keeping it in this
// browser's IndexedDB (assetStore). The document stores only an `idb-asset:<id>`
// reference, so a file has to be read back from there whenever it is needed.

import { saveAsset, getAsset, assetUrlFor, isAssetUrl, assetIdFromUrl } from '../../assetStore'

export type UploadKind = 'image' | 'video' | 'audio'
export interface UploadedMedia { kind: UploadKind; src: string; alt: string }

const MB = 1024 * 1024

export const UPLOAD_RULES: Record<UploadKind, { label: string; max: number; types: string[]; prefix: string }> = {
  image: {
    label: 'Image', max: 15 * MB, prefix: 'img-',
    types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'],
  },
  video: {
    label: 'Video', max: 10 * MB, prefix: 'vid-',
    types: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
  },
  audio: {
    label: 'Audio', max: 10 * MB, prefix: 'aud-',
    types: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/wave'],
  },
}

/** Why a file cannot be used, or null when it is fine. */
export function validateMediaFile(kind: UploadKind, file: Pick<File, 'type' | 'size'>): string | null {
  const rule = UPLOAD_RULES[kind]
  if (!rule.types.includes(file.type)) return `${rule.label}: this file type is not supported.`
  if (file.size > rule.max) return `${rule.label} files can be up to ${rule.max / MB} MB.`
  return null
}

/** Opens the browser's file picker straight away; resolves null on cancel. */
function pickFile(kind: UploadKind): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = UPLOAD_RULES[kind].types.join(',')
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/** Picks a file, checks it, and stores it. Tells the user when the file is rejected. */
export async function pickAndStoreMedia(kind: UploadKind): Promise<UploadedMedia | null> {
  const file = await pickFile(kind)
  if (!file) return null
  const problem = validateMediaFile(kind, file)
  if (problem) { window.alert(problem); return null }
  const id = UPLOAD_RULES[kind].prefix + crypto.randomUUID()
  await saveAsset(id, file)
  return { kind, src: assetUrlFor(id), alt: file.name.replace(/\.[^.]+$/, '') }
}

/** The stored file behind a media `src`, or null for a plain link or a file this browser lacks. */
export async function storedMediaBlob(src: string): Promise<Blob | null> {
  return isAssetUrl(src) ? getAsset(assetIdFromUrl(src)) : null
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
