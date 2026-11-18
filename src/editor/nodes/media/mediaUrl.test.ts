import { describe, it, expect } from 'vitest'
import { parseEmbed, isSafeEmbedSrc } from './mediaUrl'

describe('parseEmbed', () => {
  it('handles YouTube link shapes', () => {
    const id = 'dQw4w9WgXcQ'
    for (const u of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://m.youtube.com/watch?v=${id}&feature=share`,
    ]) {
      expect(parseEmbed(u)).toEqual({ kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` })
    }
  })
  it('keeps the start time', () => {
    expect(parseEmbed('https://youtu.be/dQw4w9WgXcQ?t=1m30s')?.src).toContain('start=90')
    expect(parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42')?.src).toContain('start=42')
  })
  it('rejects a bad YouTube id', () => {
    expect(parseEmbed('https://www.youtube.com/watch?v=short')).toBeNull()
  })
  it('handles Vimeo', () => {
    expect(parseEmbed('https://vimeo.com/123456789')).toEqual({ kind: 'vimeo', src: 'https://player.vimeo.com/video/123456789' })
  })
  it('detects direct video files', () => {
    expect(parseEmbed('https://cdn.example.com/a/clip.mp4')?.kind).toBe('video')
  })
  it('extracts src from pasted iframe code', () => {
    const html = '<iframe width="560" src="https://www.youtube.com/embed/dQw4w9WgXcQ" allowfullscreen></iframe>'
    expect(parseEmbed(html)?.kind).toBe('youtube')
    expect(parseEmbed('<iframe src="//example.com/x"></iframe>')).toEqual({ kind: 'embed', src: 'https://example.com/x' })
  })
  it('passes other https pages as embeds', () => {
    expect(parseEmbed('https://phet.colorado.edu/sims/x.html')?.kind).toBe('embed')
  })
  it('rejects non-https and junk', () => {
    for (const u of ['http://example.com', 'javascript:alert(1)', 'data:text/html,hi', 'not a url', '', '<iframe></iframe>']) {
      expect(parseEmbed(u)).toBeNull()
    }
  })
})

describe('isSafeEmbedSrc', () => {
  it('only allows https', () => {
    expect(isSafeEmbedSrc('https://a.com')).toBe(true)
    expect(isSafeEmbedSrc('javascript:1')).toBe(false)
    expect(isSafeEmbedSrc('http://a.com')).toBe(false)
  })
})
