// Shared coordinate-plane math for any block that renders points on an
// SVG grid (Graph, Geometry). Keeping this in one place means both blocks
// use the exact same axis range, pixel scale, and point id scheme.

export interface PlanePoint { id: string; x: number; y: number }

export const RANGE = 10 // axes run from -RANGE to +RANGE on both sides
export const SIZE = 360 // SVG viewport, in px, square
export const SCALE = SIZE / (RANGE * 2)

export function toPx(x: number, y: number): [number, number] {
  return [SIZE / 2 + x * SCALE, SIZE / 2 - y * SCALE]
}

export function toData(px: number, py: number): [number, number] {
  return [(px - SIZE / 2) / SCALE, (SIZE / 2 - py) / SCALE]
}

export function snap(n: number): number {
  return Math.round(n * 2) / 2 // snap to nearest 0.5 unit
}

let nextPointId = 0
export function makePointId(): string {
  nextPointId += 1
  return `p${Date.now().toString(36)}${nextPointId}`
}

/**
 * Clips the infinite line (or, with forwardOnly, the ray starting at
 * (x0,y0) through (x0+dx,y0+dy)) to the [-RANGE,RANGE] square, in data
 * space. Returns the two endpoints to actually draw, or null if none of
 * it is visible.
 */
export function clipLineToBounds(
  x0: number, y0: number, dx: number, dy: number, forwardOnly = false,
): [number, number, number, number] | null {
  // Two coincident points give no direction to draw a line/ray through —
  // without this guard, the slab test below ends up computing
  // (-Infinity * 0), which is NaN, not a usable coordinate.
  if (dx === 0 && dy === 0) return null

  function axisRange(c0: number, dc: number): [number, number] {
    if (dc === 0) return c0 >= -RANGE && c0 <= RANGE ? [-Infinity, Infinity] : [1, -1]
    const t1 = (-RANGE - c0) / dc
    const t2 = (RANGE - c0) / dc
    return [Math.min(t1, t2), Math.max(t1, t2)]
  }
  const [txmin, txmax] = axisRange(x0, dx)
  const [tymin, tymax] = axisRange(y0, dy)
  let tmin = Math.max(txmin, tymin)
  const tmax = Math.min(txmax, tymax)
  if (forwardOnly) tmin = Math.max(tmin, 0)
  if (tmin > tmax) return null
  return [x0 + tmin * dx, y0 + tmin * dy, x0 + tmax * dx, y0 + tmax * dy]
}

/** Grid + axis line segments, shared by any block drawing this plane. */
export function gridLines(): { x1: number; y1: number; x2: number; y2: number; major: boolean }[] {
  const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = []
  for (let i = -RANGE; i <= RANGE; i++) {
    const [x, t] = toPx(i, RANGE)
    const [, b] = toPx(i, -RANGE)
    lines.push({ x1: x, y1: t, x2: x, y2: b, major: i === 0 })
    const [l, y] = toPx(-RANGE, i)
    const [r] = toPx(RANGE, i)
    lines.push({ x1: l, y1: y, x2: r, y2: y, major: i === 0 })
  }
  return lines
}
