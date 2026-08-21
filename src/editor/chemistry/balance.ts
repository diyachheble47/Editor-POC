// Balances a chemical reaction using the standard linear-algebra method:
// treat each compound's coefficient as an unknown, write one equation per
// element ("atoms in = atoms out"), and solve. This is real math, not a
// chemistry-notation concern — mhchem (used for rendering) has no opinion
// on balancing, so there's no existing library step to reuse here; this
// is the one piece of genuinely custom logic in the whole feature.
//
// We use exact fractions (via BigInt) instead of floating point numbers,
// so we don't get rounding artifacts like 1.9999999 instead of 2.

import { parseFormula } from './formula'
import type { ParsedEquation, Term } from './reaction'

function gcdBig(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a
  b = b < 0n ? -b : b
  while (b) {
    ;[a, b] = [b, a % b]
  }
  return a
}

class Frac {
  n: bigint
  d: bigint

  constructor(n: bigint, d: bigint = 1n) {
    if (d < 0n) {
      n = -n
      d = -d
    }
    const g = gcdBig(n, d) || 1n
    this.n = g === 0n ? n : n / g
    this.d = g === 0n ? d : d / g
  }

  static zero() {
    return new Frac(0n)
  }
  static one() {
    return new Frac(1n)
  }
  isZero() {
    return this.n === 0n
  }
  add(o: Frac) {
    return new Frac(this.n * o.d + o.n * this.d, this.d * o.d)
  }
  sub(o: Frac) {
    return new Frac(this.n * o.d - o.n * this.d, this.d * o.d)
  }
  mul(o: Frac) {
    return new Frac(this.n * o.n, this.d * o.d)
  }
  div(o: Frac) {
    return new Frac(this.n * o.d, this.d * o.n)
  }
  negate() {
    return new Frac(-this.n, this.d)
  }
}

// Reduced-row-echelon form via Gauss-Jordan elimination over fractions.
// Returns the pivot column for each row (or -1 if the row became all
// zero), so the caller can tell pivot columns from free columns.
function toRref(matrix: Frac[][]): number[] {
  const rows = matrix.length
  const cols = matrix[0]?.length ?? 0
  const pivotColOfRow: number[] = new Array(rows).fill(-1)
  let pivotRow = 0

  for (let col = 0; col < cols && pivotRow < rows; col++) {
    let sel = -1
    for (let r = pivotRow; r < rows; r++) {
      if (!matrix[r][col].isZero()) {
        sel = r
        break
      }
    }
    if (sel === -1) continue

    ;[matrix[pivotRow], matrix[sel]] = [matrix[sel], matrix[pivotRow]]

    const pivotVal = matrix[pivotRow][col]
    matrix[pivotRow] = matrix[pivotRow].map((v) => v.div(pivotVal))

    for (let r = 0; r < rows; r++) {
      if (r === pivotRow) continue
      const factor = matrix[r][col]
      if (factor.isZero()) continue
      matrix[r] = matrix[r].map((v, c) => v.sub(factor.mul(matrix[pivotRow][c])))
    }

    pivotColOfRow[pivotRow] = col
    pivotRow++
  }

  return pivotColOfRow
}

function lcmBig(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n
  return (a / gcdBig(a, b)) * b
}

export interface BalanceResult {
  reactants: Term[]
  products: Term[]
}

// Balances the reaction, keeping each term's state/charge but replacing
// coefficients. Returns null if the reaction can't be auto-balanced (e.g.
// invalid elements, or a system with more than one degree of freedom —
// a known limitation of this simple POC balancer).
export function balanceEquation(equation: ParsedEquation): BalanceResult | null {
  if (equation.type !== 'reaction' && equation.type !== 'equilibrium') return null

  const compounds = [
    ...equation.reactants.map((t) => ({ term: t, sign: 1 })),
    ...equation.products.map((t) => ({ term: t, sign: -1 })),
  ]
  if (compounds.length < 2) return null

  const formulaCounts = compounds.map((c) => parseFormula(c.term.formula))
  if (formulaCounts.some((c) => c === null)) return null // invalid element somewhere

  const elements = Array.from(
    new Set(formulaCounts.flatMap((counts) => Object.keys(counts as object))),
  ).sort()
  if (elements.length === 0) return null

  const n = compounds.length

  // One row per element, one column per compound: matrix[element][compound]
  // is how many atoms of that element one unit of that compound
  // contributes (positive for reactants, negative for products — so a
  // balanced equation is exactly the vector that makes every row sum to
  // zero, i.e. the matrix's null space).
  function buildElementMatrix(): Frac[][] {
    return elements.map((element) =>
      compounds.map((c, i) => {
        const count = (formulaCounts[i] as Record<string, number>)[element] || 0
        return new Frac(BigInt(count * c.sign))
      }),
    )
  }

  const pivotColOfRow = toRref(buildElementMatrix())
  const pivotCols = new Set(pivotColOfRow.filter((c) => c >= 0))
  const freeCols = Array.from({ length: n }, (_, i) => i).filter((i) => !pivotCols.has(i))
  if (freeCols.length !== 1) return null // POC limitation: only single-degree-of-freedom systems

  const freeCol = freeCols[0]

  // Solving the null space: pick a value for the one free variable, then
  // read every pivot variable's value straight off the reduced matrix
  // (each pivot row directly states x[pivotCol] = -row[freeCol] * x[freeCol]).
  function solveWithFreeValue(freeValue: Frac): Frac[] {
    const x: Frac[] = new Array(n).fill(Frac.zero())
    x[freeCol] = freeValue

    const rref = buildElementMatrix()
    const pivots = toRref(rref)

    for (let r = 0; r < pivots.length; r++) {
      const col = pivots[r]
      if (col === -1) continue
      x[col] = rref[r][freeCol].mul(freeValue).negate()
    }
    return x
  }

  let solution = solveWithFreeValue(Frac.one())
  if (solution.some((f) => f.n < 0n)) {
    solution = solveWithFreeValue(new Frac(-1n))
  }
  if (solution.some((f) => f.n <= 0n)) return null // couldn't get all-positive coefficients

  let denomLcm = 1n
  for (const f of solution) denomLcm = lcmBig(denomLcm, f.d)
  let integers = solution.map((f) => (f.n * (denomLcm / f.d)))

  let overallGcd = 0n
  for (const v of integers) overallGcd = gcdBig(overallGcd, v)
  if (overallGcd > 1n) integers = integers.map((v) => v / overallGcd)

  const coefficients = integers.map((v) => Number(v))

  const reactants = equation.reactants.map((t, i) => ({ ...t, coefficient: coefficients[i] }))
  const products = equation.products.map((t, i) => ({
    ...t,
    coefficient: coefficients[equation.reactants.length + i],
  }))

  return { reactants, products }
}
