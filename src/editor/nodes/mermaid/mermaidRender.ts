// Renders Mermaid text to an SVG string. The mermaid library is large, so it is
// fetched only when a document actually has a diagram. Renders are queued (the
// library is not safe to run concurrently) and the last results are cached, so
// scrolling a diagram out and back in does not draw it again.

import type { Theme } from '../../../context/ThemeContext'

type Mermaid = typeof import('mermaid').default

let lib: Promise<Mermaid> | null = null
let queue: Promise<unknown> = Promise.resolve()
let counter = 0
let lastTheme: Theme | null = null

const cache = new Map<string, string>()
const CACHE_MAX = 40

function load(): Promise<Mermaid> {
  lib ??= import('mermaid').then(m => m.default)
  return lib
}

export class MermaidError extends Error {}

function readableError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  // Mermaid's messages end with a caret diagram; the first lines are enough.
  return text.split('\n').slice(0, 4).join('\n').trim() || 'Could not draw this diagram.'
}

export function renderMermaid(code: string, theme: Theme): Promise<string> {
  const key = `${theme}\u0000${code}`
  const hit = cache.get(key)
  if (hit !== undefined) {
    cache.delete(key); cache.set(key, hit) // most recently used goes last
    return Promise.resolve(hit)
  }

  const job = queue.then(async () => {
    const mermaid = await load()
    if (lastTheme !== theme) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict', // sanitises the text and strips scripts / click handlers
        theme: theme === 'dark' ? 'dark' : 'default',
        fontFamily: 'inherit',
      })
      lastTheme = theme
    }
    try {
      await mermaid.parse(code) // throws on bad syntax without leaving junk in the page
      const { svg } = await mermaid.render(`mmd-${++counter}`, code)
      cache.set(key, svg)
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string)
      return svg
    } catch (err) {
      throw new MermaidError(readableError(err))
    }
  })
  queue = job.catch(() => {})
  return job
}
