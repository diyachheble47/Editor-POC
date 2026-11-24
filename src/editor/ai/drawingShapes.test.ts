import { describe, expect, it } from 'vitest'
import { drawingElements } from './drawingShapes'

describe('drawingElements', () => {
  it('turns each shape into an Excalidraw element, with its label as a separate text element', () => {
    const els = drawingElements([
      { kind: 'rect', x: 10, y: 20, w: 100, h: 50, text: 'Heart' },
      { kind: 'arrow', x: 0, y: 0, w: 40, h: 0 },
      { kind: 'text', x: 5, y: 5, w: 0, h: 0, text: 'Title' },
    ])
    expect(els.map(e => e.type)).toEqual(['rectangle', 'text', 'arrow', 'text'])
    expect(els[2]).toMatchObject({ points: [[0, 0], [40, 0]], endArrowhead: 'arrow' })
    expect(new Set(els.map(e => e.id)).size).toBe(els.length)
  })
})
