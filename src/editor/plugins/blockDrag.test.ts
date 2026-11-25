import { describe, it, expect } from 'vitest'
import { dragLabel, dropSlot, edgeScrollSpeed, isNoopSlot, slotLineY } from './blockDrag'

// Three blocks with 20px gaps: 0-100, 120-180, 200-400
const rects = [{ top: 0, bottom: 100 }, { top: 120, bottom: 180 }, { top: 200, bottom: 400 }]

describe('dropSlot', () => {
  it('picks the gap by which half of a block the pointer is in', () => {
    expect(dropSlot(rects, 10)).toBe(0)     // top half of block 0 -> before it
    expect(dropSlot(rects, 70)).toBe(1)     // bottom half of block 0 -> after it
    expect(dropSlot(rects, 130)).toBe(1)
    expect(dropSlot(rects, 170)).toBe(2)
    expect(dropSlot(rects, 390)).toBe(3)    // bottom half of the last block -> the end
  })
  it('never loses the target in a gap or outside the page', () => {
    expect(dropSlot(rects, 110)).toBe(1)    // in the gap between blocks 0 and 1
    expect(dropSlot(rects, -500)).toBe(0)
    expect(dropSlot(rects, 9999)).toBe(3)
  })
  it('handles an empty document', () => {
    expect(dropSlot([], 50)).toBe(0)
  })
})

describe('isNoopSlot', () => {
  it('is true right before and right after the dragged block', () => {
    expect(isNoopSlot(1, 1)).toBe(true)
    expect(isNoopSlot(2, 1)).toBe(true)
    expect(isNoopSlot(0, 1)).toBe(false)
    expect(isNoopSlot(3, 1)).toBe(false)
  })
})

describe('slotLineY', () => {
  it('draws the line in the middle of the gap, and at the page ends', () => {
    expect(slotLineY(rects, 0)).toBe(0)
    expect(slotLineY(rects, 1)).toBe(110)
    expect(slotLineY(rects, 2)).toBe(190)
    expect(slotLineY(rects, 3)).toBe(400)
  })
})

describe('edgeScrollSpeed', () => {
  it('is 0 in the middle of the page', () => {
    expect(edgeScrollSpeed(300, 0, 600)).toBe(0)
  })
  it('scrolls up near the top and down near the bottom, faster closer to the edge', () => {
    expect(edgeScrollSpeed(60, 0, 600)).toBeLessThan(0)
    expect(edgeScrollSpeed(540, 0, 600)).toBeGreaterThan(0)
    expect(Math.abs(edgeScrollSpeed(5, 0, 600))).toBeGreaterThan(Math.abs(edgeScrollSpeed(60, 0, 600)))
  })
  it('stops accelerating at the maximum, even past the edge', () => {
    expect(edgeScrollSpeed(-400, 0, 600, 72, 22)).toBe(-22)
    expect(edgeScrollSpeed(2000, 0, 600, 72, 22)).toBe(22)
  })
})

describe('dragLabel', () => {
  it('shortens long text and falls back for a block with no text', () => {
    expect(dragLabel('  Plants   make food  ')).toBe('Plants make food')
    expect(dragLabel('x'.repeat(100)).length).toBe(56)
    expect(dragLabel('x'.repeat(100)).endsWith('…')).toBe(true)
    expect(dragLabel('   ')).toBe('Block')
  })
})
