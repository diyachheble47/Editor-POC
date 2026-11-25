// Turns the document's rendered blocks into short pieces of text for the browser's
// speech engine (Web Speech API). Pure DOM-in, text-out, so it can be tested.

export interface SpeechPiece {
  /** The top-level block this text came from (highlighted while it is read). */
  el: HTMLElement
  text: string
}

/** Things that have no sensible spoken form: pictures, controls, formulas, code blocks. */
const SKIP = '.media-player, pre, canvas, svg, img, iframe, video, audio, button, input, textarea, style, script, .katex, .rz-handle, [aria-hidden="true"]'
/** Items that should end with a pause, so a list or table row is not read as one run-on line. */
const PAUSE_AFTER = 'li, th, td, h1, h2, h3, h4, h5, h6'
const ENDS_SENTENCE = /[.!?:;,]$/

/** The words of one block as they should be spoken. */
export function readableText(block: HTMLElement): string {
  const copy = block.cloneNode(true) as HTMLElement
  copy.querySelectorAll(SKIP).forEach(n => n.remove())
  copy.querySelectorAll(PAUSE_AFTER).forEach(n => {
    if (!ENDS_SENTENCE.test((n.textContent ?? '').trim())) n.append('. ')
    else n.append(' ')
  })
  copy.querySelectorAll('p, div, br').forEach(n => n.append(' '))
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Splits text into sentences no longer than `max` characters. Browsers cut off long
 * utterances (Chrome stops after about 15 seconds), so each piece is kept short.
 */
export function splitSentences(text: string, max = 220): string[] {
  const out: string[] = []
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    let rest = sentence.trim()
    while (rest.length > max) {
      let cut = rest.lastIndexOf(' ', max)
      if (cut <= 0) cut = max
      out.push(rest.slice(0, cut).trim())
      rest = rest.slice(cut).trim()
    }
    if (rest) out.push(rest)
  }
  return out
}

/** Every block of the document that has something to say, in reading order. */
export function speechPieces(root: HTMLElement): SpeechPiece[] {
  const pieces: SpeechPiece[] = []
  for (const child of Array.from(root.children)) {
    if (!(child instanceof HTMLElement)) continue
    for (const text of splitSentences(readableText(child))) pieces.push({ el: child, text })
  }
  return pieces
}
