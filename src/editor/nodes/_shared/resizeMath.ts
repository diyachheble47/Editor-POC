// The maths of dragging a resize handle. No DOM and no React, so it can be tested.
//
// The side opposite the handle stays where it is: dragging the right side by `dx` makes the box
// `dx` wider and the left edge does not move (and the other way round for the left side). Corners
// keep the picture's shape (when the frame has a height of its own); side handles change one
// direction only.

export type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'e' | 'w' | 's'
export type Align = 'left' | 'center' | 'right'

/** Where the box ends up leaning after a drag: the side that did not move is the side it stays on. */
export function alignAfter(handle: Handle, current: Align): Align {
  if (handle.includes('e')) return 'left'
  if (handle.includes('w')) return 'right'
  return current
}

/** Left offset inside the column that keeps the opposite edge fixed, never leaving the column. */
export function anchoredLeft(handle: Handle, startLeft: number, startW: number, w: number, column: number): number {
  const desired = handle.includes('w') ? startLeft + startW - w : startLeft
  return Math.min(Math.max(desired, 0), Math.max(0, column - w))
}

export interface Limits { minW: number; maxW: number; minH: number; maxH: number }

export interface ResizeInput {
  handle: Handle
  /** Size when the drag started. */
  w: number
  h: number
  /** How far the pointer has moved since then. */
  dx: number
  dy: number
  limits: Limits
  /** Does this frame have a height of its own (a diagram), or does it follow its width (a picture)? */
  withHeight: boolean
  /** Width of the column the frame sits in: the widths 25%, 50%, 75% and 100% of it are snapped to. */
  column: number
  snap: boolean
}

export interface ResizeResult { w: number; h: number | undefined; snappedTo: number | null }

const SNAP_PX = 10
const SNAP_FRACTIONS = [0.25, 0.5, 0.75, 1]

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

export function resizeBox(o: ResizeInput): ResizeResult {
  const { handle, limits: L } = o
  const sx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0
  const sy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0
  const corner = handle.length === 2

  let w = o.w
  let h: number | undefined = o.withHeight ? o.h : undefined
  let snappedTo: number | null = null

  if (o.withHeight && corner) {
    // Both sides change together, keeping the shape. The axis the pointer has moved further along leads.
    const scale = Math.max((o.w + sx * o.dx) / o.w, (o.h + sy * o.dy) / o.h)
    const k = clamp(scale, Math.max(L.minW / o.w, L.minH / o.h), Math.min(L.maxW / o.w, L.maxH / o.h))
    w = o.w * k
    h = o.h * k
  } else if (handle === 's') {
    h = clamp(o.h + o.dy, L.minH, L.maxH)
  } else {
    w = clamp(o.w + sx * o.dx, L.minW, L.maxW)
  }

  if (o.snap && handle !== 's') {
    const hit = SNAP_FRACTIONS.map(f => Math.round(o.column * f))
      .find(t => t >= L.minW && t <= L.maxW && Math.abs(w - t) <= SNAP_PX)
    if (hit !== undefined) {
      if (h !== undefined && o.withHeight && corner) h = h * (hit / w)
      w = hit
      snappedTo = hit
    }
  }
  return { w: Math.round(w), h: h === undefined ? undefined : Math.round(h), snappedTo }
}

/** "480 × 270 px", or, when it snapped to a share of the column, "50% of the page". */
export function sizeLabel(r: ResizeResult, column: number): string {
  if (r.snappedTo !== null && column > 0) {
    const pct = Math.round((r.snappedTo / column) * 100)
    return pct === 100 ? 'Full width' : `${pct}% of the page`
  }
  return r.h === undefined ? `${r.w} px` : `${r.w} × ${r.h} px`
}

/** Which way the mouse cursor should point while a handle is dragged. */
export function cursorFor(handle: Handle): string {
  if (handle === 'e' || handle === 'w') return 'ew-resize'
  if (handle === 's') return 'ns-resize'
  return handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize'
}
