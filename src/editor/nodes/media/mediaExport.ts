// Video and audio blocks in an exported copy of the document.
//
// The player's own markup is dropped and the original file is read back from
// IndexedDB (the block wrapper keeps its `data-media-*` attributes for this):
//   HTML — a plain <video>/<audio> with the file embedded, so it plays offline.
//   PDF  — paper cannot play anything, so a card shows a still frame of the
//          video (or just the title for audio) and its length.

import { blobToDataUrl, storedMediaBlob } from './mediaFiles'

type Kind = 'video' | 'audio'
interface Slot { el: HTMLElement; kind: Kind; src: string; name: string }

function slots(body: HTMLElement): Slot[] {
  return Array.from(body.querySelectorAll<HTMLElement>('.media-player[data-media-kind]')).map(el => ({
    el,
    kind: el.dataset.mediaKind === 'audio' ? 'audio' : 'video',
    src: el.dataset.mediaSrc ?? '',
    name: el.dataset.mediaName ?? '',
  }))
}

const MEDIA_WAIT_MS = 6000

/** Waits for one media event; rejects when the file cannot be read or takes too long. */
function once(media: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail(new Error('timeout')), MEDIA_WAIT_MS)
    const cleanup = () => {
      clearTimeout(timer)
      media.removeEventListener(event, ok)
      media.removeEventListener('error', fail)
    }
    const ok = () => { cleanup(); resolve() }
    const fail = (e: unknown) => { cleanup(); reject(e instanceof Error ? e : new Error('unreadable media')) }
    media.addEventListener(event, ok)
    media.addEventListener('error', fail)
  })
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** A still picture and the length of a video: one second in, or the middle of a shorter clip. */
async function inspectVideo(url: string): Promise<{ frame: string; duration: number }> {
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'
  video.src = url
  try {
    await once(video, 'loadeddata')
    const duration = video.duration
    const at = Math.min(1, (Number.isFinite(duration) ? duration : 0) / 2)
    if (at > 0) {
      const seeked = once(video, 'seeked')
      video.currentTime = at
      await seeked
    }
    const scale = Math.min(1, 960 / (video.videoWidth || 960))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    return { frame: canvas.toDataURL('image/jpeg', 0.85), duration }
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

async function audioDuration(url: string): Promise<number> {
  const audio = document.createElement('audio')
  audio.preload = 'metadata'
  audio.src = url
  try {
    await once(audio, 'loadedmetadata')
    return audio.duration
  } finally {
    audio.removeAttribute('src')
    audio.load()
  }
}

/** A URL the browser can load for this block, and a function that releases it. */
async function openSource(src: string): Promise<{ url: string; release: () => void } | null> {
  const blob = await storedMediaBlob(src)
  if (blob) {
    const url = URL.createObjectURL(blob)
    return { url, release: () => URL.revokeObjectURL(url) }
  }
  return /^https:/.test(src) ? { url: src, release: () => {} } : null
}

/** Puts a native, controllable player (with the file embedded) where the Video.js player was. */
export async function embedMediaForHtml(body: HTMLElement): Promise<void> {
  await Promise.all(slots(body).map(async ({ el, kind, src }) => {
    try {
      const blob = await storedMediaBlob(src)
      const player = document.createElement(kind)
      player.controls = true
      player.preload = 'metadata'
      if (player instanceof HTMLVideoElement) player.playsInline = true
      player.src = blob ? await blobToDataUrl(blob) : src
      el.replaceChildren(player)
    } catch {
      el.replaceChildren(note('This file could not be included in the export.'))
    }
  }))
}

function note(text: string): HTMLElement {
  const p = document.createElement('div')
  p.className = 'pdf-placeholder'
  p.textContent = text
  return p
}

function card(label: string, title: string, detail: string, frame?: string): HTMLElement {
  const box = document.createElement('div')
  box.className = 'pdf-embed'
  const tag = document.createElement('div')
  tag.className = 'pdf-embed-label'
  tag.textContent = label
  box.append(tag)
  if (frame) {
    const img = document.createElement('img')
    img.className = 'pdf-embed-thumb'
    img.src = frame
    img.alt = ''
    box.append(img)
  }
  if (title) {
    const t = document.createElement('div')
    t.className = 'pdf-embed-title'
    t.textContent = title
    box.append(t)
  }
  const d = document.createElement('div')
  d.className = 'pdf-embed-note'
  d.textContent = detail
  box.append(d)
  return box
}

/** Replaces each player with a card: a still frame for video, the title for audio. */
export async function printMediaForPdf(body: HTMLElement): Promise<void> {
  await Promise.all(slots(body).map(async ({ el, kind, src, name }) => {
    const label = kind === 'video' ? 'Video' : 'Audio'
    const open = await openSource(src).catch(() => null)
    let frame: string | undefined
    let length = ''
    if (open) {
      try {
        if (kind === 'video') {
          const info = await inspectVideo(open.url)
          frame = info.frame
          length = formatDuration(info.duration)
        } else {
          length = formatDuration(await audioDuration(open.url))
        }
      } catch { /* an unreadable file still gets a card, just without a picture or length */ }
      finally { open.release() }
    }
    const detail = [length, 'Open the document to play it.'].filter(Boolean).join(' · ')
    el.replaceChildren(card(label, name, detail, frame))
  }))
}
