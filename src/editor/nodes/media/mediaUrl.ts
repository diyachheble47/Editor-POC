// Turns whatever a teacher pastes (a YouTube/Vimeo link, a direct video link,
// a page URL, or a whole <iframe …> snippet) into something safe to embed.
// Only https is accepted; javascript:, data: and friends are rejected.

export type EmbedKind = 'youtube' | 'vimeo' | 'video' | 'embed'
export interface ParsedEmbed { kind: EmbedKind; src: string }

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'])
const VIDEO_EXT = /\.(mp4|webm|ogv|ogg|mov|m4v)$/i
const YT_ID = /^[\w-]{11}$/

/** "90", "1m30s", "1h2m3s" → seconds. */
function parseStart(raw: string | null): number {
  if (!raw) return 0
  if (/^\d+$/.test(raw)) return Number(raw)
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw)
  if (!m) return 0
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/** Pulls the address out of pasted iframe code; passes plain links through. */
function extractUrl(input: string): string {
  const text = input.trim()
  if (text.startsWith('<')) {
    const m = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(text)
    const src = m ? m[1].trim() : ''
    return src.startsWith('//') ? `https:${src}` : src
  }
  return text.startsWith('//') ? `https:${text}` : text
}

export function parseEmbed(input: string): ParsedEmbed | null {
  const raw = extractUrl(input)
  if (!raw) return null
  let url: URL
  try { url = new URL(raw) } catch { return null }
  if (url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase()

  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null
  else if (YT_HOSTS.has(host)) {
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] === 'watch') id = url.searchParams.get('v')
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1] ?? null
  }
  if (id !== null) {
    if (!YT_ID.test(id)) return null
    const start = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start'))
    const q = `rel=0${start ? `&start=${start}` : ''}`
    return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}?${q}` }
  }

  if (host === 'vimeo.com' || host === 'www.vimeo.com' || host === 'player.vimeo.com') {
    const m = /(?:^|\/)(\d{5,})(?:\/|$)/.exec(url.pathname)
    if (!m) return null
    return { kind: 'vimeo', src: `https://player.vimeo.com/video/${m[1]}` }
  }

  if (VIDEO_EXT.test(url.pathname)) return { kind: 'video', src: url.toString() }
  return { kind: 'embed', src: url.toString() }
}

/** Last line of defence when rendering a saved document. */
export function isSafeEmbedSrc(src: string): boolean {
  try { return new URL(src).protocol === 'https:' } catch { return false }
}
