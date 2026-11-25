import { describe, it, expect } from 'vitest'
import { alignAfter, anchoredLeft, cursorFor, resizeBox, sizeLabel } from './resizeMath'
import type { ResizeInput } from './resizeMath'

const L = { minW: 100, maxW: 800, minH: 80, maxH: 600 }
const base: ResizeInput = { handle: 'e', w: 400, h: 200, dx: 0, dy: 0, limits: L, withHeight: false, column: 1000, snap: false }
const go = (o: Partial<ResizeInput>) => resizeBox({ ...base, ...o })

describe('side handles', () => {
  it('change the width by exactly the pointer move: the far side stays put', () => {
    expect(go({ handle: 'e', dx: 50 }).w).toBe(450)
    expect(go({ handle: 'w', dx: -50 }).w).toBe(450) // dragging the left side outwards
    expect(go({ handle: 'e', dx: -50 }).w).toBe(350)
  })
  it('stay within the limits', () => {
    expect(go({ handle: 'e', dx: 9999 }).w).toBe(800)
    expect(go({ handle: 'e', dx: -9999 }).w).toBe(100)
  })
  it('leave the height alone on a picture, and only the height on the bottom handle of a diagram', () => {
    expect(go({ handle: 'e', dx: 20 }).h).toBeUndefined()
    const r = go({ handle: 's', dy: 60, withHeight: true })
    expect(r.w).toBe(400)
    expect(r.h).toBe(260)
  })
})

describe('corners', () => {
  it('only change the width on a picture (its height follows)', () => {
    const r = go({ handle: 'se', dx: 30, dy: 500 })
    expect(r.w).toBe(430)
    expect(r.h).toBeUndefined()
  })
  it('keep the shape of a diagram', () => {
    const r = go({ handle: 'se', dx: 100, dy: 0, withHeight: true })
    expect(r.w).toBe(500)
    expect(r.h).toBe(250) // 400:200 stays 2:1
  })
  it('follow whichever axis the pointer moved further along', () => {
    const r = go({ handle: 'se', dx: 0, dy: 100, withHeight: true })
    expect(r.h).toBe(300)
    expect(r.w).toBe(600)
  })
  it('stay in the limits without bending the shape', () => {
    const r = go({ handle: 'se', dx: 9999, dy: 9999, withHeight: true })
    expect(r.w / (r.h as number)).toBeCloseTo(2, 1)
    expect(r.w).toBeLessThanOrEqual(800)
    expect(r.h).toBeLessThanOrEqual(600)
  })
})

describe('snapping', () => {
  it('pulls the width to 50% or 100% of the column when close', () => {
    expect(go({ handle: 'e', dx: 94, snap: true })).toMatchObject({ w: 500, snappedTo: 500 }) // 494 -> 500
    expect(go({ handle: 'e', dx: 94, snap: false }).snappedTo).toBeNull()
  })
  it('does nothing when far from every snap point', () => {
    expect(go({ handle: 'e', dx: 40, snap: true }).snappedTo).toBeNull()
  })
  it('keeps the shape of a diagram when it snaps', () => {
    const r = go({ handle: 'se', dx: 94, withHeight: true, snap: true })
    expect(r.w).toBe(500)
    expect(r.h).toBe(250)
  })
  it('ignores a snap point outside the limits', () => {
    // 100% of the column is 1000, over the 800 maximum
    expect(go({ handle: 'e', dx: 9999, snap: true }).snappedTo).toBeNull()
  })
})

describe('anchoring', () => {
  it('leans the box toward the side that did not move', () => {
    expect(alignAfter('e', 'center')).toBe('left')
    expect(alignAfter('se', 'right')).toBe('left')
    expect(alignAfter('w', 'center')).toBe('right')
    expect(alignAfter('sw', 'left')).toBe('right')
    expect(alignAfter('s', 'center')).toBe('center') // the bottom side does not move it sideways
  })
  it('keeps the left edge fixed for a right handle, and the right edge fixed for a left handle', () => {
    expect(anchoredLeft('e', 100, 400, 500, 1000)).toBe(100)         // grew to the right
    expect(anchoredLeft('w', 100, 400, 300, 1000)).toBe(200)         // shrank from the left: right edge 500 stays
    expect(anchoredLeft('w', 100, 400, 600, 1000)).toBe(0)           // grew past the column on the left: stops at the edge
  })
  it('slides back inside the column instead of overflowing it', () => {
    expect(anchoredLeft('e', 300, 400, 900, 1000)).toBe(100)
  })
})

describe('labels and cursors', () => {
  it('says what the size is, or which share of the page it snapped to', () => {
    expect(sizeLabel({ w: 480, h: undefined, snappedTo: null }, 1000)).toBe('480 px')
    expect(sizeLabel({ w: 480, h: 270, snappedTo: null }, 1000)).toBe('480 × 270 px')
    expect(sizeLabel({ w: 500, h: undefined, snappedTo: 500 }, 1000)).toBe('50% of the page')
    expect(sizeLabel({ w: 800, h: undefined, snappedTo: 800 }, 800)).toBe('Full width')
  })
  it('points the cursor along the handle', () => {
    expect(cursorFor('e')).toBe('ew-resize')
    expect(cursorFor('s')).toBe('ns-resize')
    expect(cursorFor('se')).toBe('nwse-resize')
    expect(cursorFor('sw')).toBe('nesw-resize')
  })
})
