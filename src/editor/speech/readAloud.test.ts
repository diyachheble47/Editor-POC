import { describe, it, expect } from 'vitest'
import { readableText, speechPieces, splitSentences } from './readAloud'

function el(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

describe('splitSentences', () => {
  it('splits at sentence ends', () => {
    expect(splitSentences('One. Two! Three?')).toEqual(['One.', 'Two!', 'Three?'])
  })

  it('breaks a very long sentence at word boundaries', () => {
    const long = Array.from({ length: 80 }, () => 'word').join(' ')
    const parts = splitSentences(long, 50)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.every(p => p.length <= 50)).toBe(true)
    expect(parts.join(' ')).toBe(long)
  })

  it('returns nothing for empty text', () => {
    expect(splitSentences('   ')).toEqual([])
  })
})

describe('readableText', () => {
  it('pauses between list items', () => {
    expect(readableText(el('<ul><li>Apples</li><li>Pears</li></ul>'))).toBe('Apples. Pears.')
  })

  it('leaves out code blocks, buttons and pictures', () => {
    const block = el('<p>Hello <img alt="x"><button>Edit</button></p><pre>let a = 1</pre>')
    expect(readableText(block)).toBe('Hello')
  })

  it('leaves out a video or audio player, including its time labels', () => {
    const block = el('<div><div class="media-player"><time>0:00</time><time>-0:00</time></div></div>').firstElementChild as HTMLElement
    expect(readableText(block)).toBe('')
    expect(speechPieces(el('<div><div class="media-player"><time>0:00</time></div></div><p>Hi.</p>')).map(p => p.text)).toEqual(['Hi.'])
  })

  it('does not add a second stop after a heading that already ends in one', () => {
    expect(readableText(el('<h2>Why?</h2><p>Because.</p>'))).toBe('Why? Because.')
  })
})

describe('speechPieces', () => {
  it('keeps the block each piece came from and skips empty blocks', () => {
    const root = el('<p>First. Second.</p><p></p><h2>Title</h2>')
    const pieces = speechPieces(root)
    expect(pieces.map(p => p.text)).toEqual(['First.', 'Second.', 'Title'])
    expect(pieces[0].el).toBe(root.children[0])
    expect(pieces[2].el).toBe(root.children[2])
  })
})
