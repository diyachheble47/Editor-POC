// The maths behind dragging a block to a new place. No DOM and no React, so it can be tested.
//
// A "slot" is a gap between blocks: 0 is before the first block, n is after the last.
// Dragging picks the slot from the pointer's height alone, never from what is under it, so
// the gaps between blocks and the empty margins beside the page cannot lose the target.

export interface BlockRect { top: number; bottom: number }

/** The gap the pointer is closest to: before the first block whose middle is below it, else the end. */
export function dropSlot(rects: readonly BlockRect[], y: number): number {
  for (let i = 0; i < rects.length; i++) {
    if (y < (rects[i].top + rects[i].bottom) / 2) return i
  }
  return rects.length
}

/** A slot right before or right after the dragged block would leave it where it is. */
export function isNoopSlot(slot: number, draggedIndex: number): boolean {
  return slot === draggedIndex || slot === draggedIndex + 1
}

/** Height (viewport) at which to draw the drop line: in the middle of the gap, not on a block's edge. */
export function slotLineY(rects: readonly BlockRect[], slot: number): number {
  if (!rects.length) return 0
  if (slot <= 0) return rects[0].top
  if (slot >= rects.length) return rects[rects.length - 1].bottom
  return (rects[slot - 1].bottom + rects[slot].top) / 2
}

/**
 * How far to scroll per frame while dragging near the top or bottom edge of the page:
 * negative is up, positive is down, 0 away from the edges. It speeds up the closer the
 * pointer gets to (or goes past) the edge.
 */
export function edgeScrollSpeed(y: number, top: number, bottom: number, zone = 72, max = 22): number {
  if (y < top + zone) return -Math.round(max * Math.min(1, (top + zone - y) / zone))
  if (y > bottom - zone) return Math.round(max * Math.min(1, (y - (bottom - zone)) / zone))
  return 0
}

/** A short label for the floating preview: the block's first words. */
export function dragLabel(text: string, max = 56): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return 'Block'
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}
