import { describe, it, expect } from 'vitest'
import { validateMediaFile } from './mediaFiles'

const MB = 1024 * 1024

describe('validateMediaFile', () => {
  it('accepts MP3 and WAV audio up to 10 MB', () => {
    expect(validateMediaFile('audio', { type: 'audio/mpeg', size: MB })).toBeNull()
    expect(validateMediaFile('audio', { type: 'audio/wav', size: 10 * MB })).toBeNull()
    expect(validateMediaFile('audio', { type: 'audio/x-wav', size: MB })).toBeNull()
  })

  it('rejects other audio formats', () => {
    expect(validateMediaFile('audio', { type: 'audio/flac', size: MB })).toMatch(/not supported/)
    expect(validateMediaFile('audio', { type: 'video/mp4', size: MB })).toMatch(/not supported/)
  })

  it('limits audio and video to 10 MB', () => {
    expect(validateMediaFile('audio', { type: 'audio/mpeg', size: 10 * MB + 1 })).toMatch(/10 MB/)
    expect(validateMediaFile('video', { type: 'video/mp4', size: 10 * MB + 1 })).toMatch(/10 MB/)
    expect(validateMediaFile('video', { type: 'video/mp4', size: 10 * MB })).toBeNull()
  })

  it('accepts the supported video types', () => {
    for (const type of ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']) {
      expect(validateMediaFile('video', { type, size: MB })).toBeNull()
    }
    expect(validateMediaFile('video', { type: 'video/x-matroska', size: MB })).toMatch(/not supported/)
  })

  it('keeps the 15 MB limit for images', () => {
    expect(validateMediaFile('image', { type: 'image/png', size: 15 * MB })).toBeNull()
    expect(validateMediaFile('image', { type: 'image/png', size: 15 * MB + 1 })).toMatch(/15 MB/)
  })
})
