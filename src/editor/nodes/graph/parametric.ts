// A parametric curve for the Graph block, typed on one line. Parts are separated
// by ";" or ",", in any order:
//
//   x(t) = a*cos(t)*(exp(cos(t)) - 2*cos(4*t)), y(t) = a*sin(t)*(exp(cos(t)) - 2*cos(4*t)), t from 0 to 24*pi, a = 1
//
// x(t) and y(t) are required. "t from A to B" sets the range (default 0 to 2*pi).
// Any other single letter with "=" is a named number the formulas may use.

import { compileExpr } from './expr'

const PART_X = /^x\s*\(\s*t\s*\)\s*=\s*(.+)$/i
const PART_Y = /^y\s*\(\s*t\s*\)\s*=\s*(.+)$/i
const PART_T = /^t\s+from\s+(.+?)\s+to\s+(.+)$/i
const PART_NUMBER = /^([a-z])\s*=\s*(.+)$/i
const RESERVED = new Set(['t', 'x', 'y', 'e', 'pi'])

/** True when the typed text is a parametric curve (x(t) = ...) rather than y = f(x). */
export function isParametric(src: string): boolean {
  return /(^|[;,\s])x\s*\(\s*t\s*\)\s*=/i.test(src)
}

export interface ParametricCurve {
  x: (t: number) => number
  y: (t: number) => number
  tMin: number
  tMax: number
}

/** Reads and compiles a parametric curve. Throws a message the user can act on. */
export function parseParametric(src: string): ParametricCurve {
  const parts = src.split(/[;,]/).map(p => p.trim()).filter(Boolean)
  let xSrc: string | null = null
  let ySrc: string | null = null
  let tFrom = '0'
  let tTo = '2*pi'
  const constants: Record<string, number> = {}

  for (const part of parts) {
    let m: RegExpMatchArray | null
    if ((m = part.match(PART_X))) xSrc = m[1]
    else if ((m = part.match(PART_Y))) ySrc = m[1]
    else if ((m = part.match(PART_T))) { tFrom = m[1]; tTo = m[2] }
    else if ((m = part.match(PART_NUMBER))) {
      const name = m[1].toLowerCase()
      if (RESERVED.has(name)) throw new Error(`"${m[1]}" is already used, pick another letter`)
      constants[name] = compileExpr(m[2], { constants })(0)
    } else {
      throw new Error(`Can't read "${part}". Write x(t) = …, y(t) = …, t from A to B, a = 1`)
    }
  }

  if (!xSrc || !ySrc) throw new Error('A curve needs both x(t) = … and y(t) = …')

  const options = { variable: 't', constants }
  const tMin = compileExpr(tFrom, options)(0)
  const tMax = compileExpr(tTo, options)(0)
  if (!(tMax > tMin)) throw new Error('The t range must go from a smaller number to a bigger one')

  return {
    x: compileExpr(xSrc, options),
    y: compileExpr(ySrc, options),
    tMin,
    tMax,
  }
}

/** Throws if the typed text can't be plotted. Used before storing an entry. */
export function checkPlot(src: string): void {
  if (isParametric(src)) parseParametric(src)
  else compileExpr(src)
}
