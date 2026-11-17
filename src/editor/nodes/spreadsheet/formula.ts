// Safe formula evaluator for the Spreadsheet block — numbers, + - * / ^,
// parentheses, cell references (A1), ranges (A1:A3) inside SUM/AVERAGE/MIN/MAX,
// and nothing else. Deliberately NOT eval()/new Function(): a typed formula
// can only ever reach this small whitelisted grammar, never arbitrary code.

export interface Grid {
  rows: number
  cols: number
  /** Raw (unevaluated) text of a cell, e.g. "=A1+B1" or "42" or "Label". */
  get(row: number, col: number): string
}

type OpValue = '+' | '-' | '*' | '/' | '^' | '(' | ')' | ':' | ','

type Token =
  | { type: 'num'; value: number }
  | { type: 'cell'; col: number; row: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: OpValue }

export function colLetterToIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1 // 0-indexed
}

export function colIndexToLetter(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === ' ' || ch === '\t') { i++; continue }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j++
      tokens.push({ type: 'num', value: Number(src.slice(i, j)) })
      i = j
      continue
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i
      while (j < src.length && /[A-Za-z]/.test(src[j])) j++
      const letters = src.slice(i, j)
      if (j < src.length && /[0-9]/.test(src[j])) {
        let k = j
        while (k < src.length && /[0-9]/.test(src[k])) k++
        tokens.push({ type: 'cell', col: colLetterToIndex(letters), row: Number(src.slice(j, k)) - 1 })
        i = k
      } else {
        tokens.push({ type: 'ident', value: letters.toUpperCase() })
        i = j
      }
      continue
    }
    if ('+-*/^():,'.includes(ch)) {
      tokens.push({ type: 'op', value: ch as OpValue })
      i++
      continue
    }
    throw new Error(`Unexpected character "${ch}"`)
  }
  return tokens
}

const AGGREGATES: Record<string, (nums: number[]) => number> = {
  SUM: (ns) => ns.reduce((a, b) => a + b, 0),
  AVERAGE: (ns) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0),
  MIN: (ns) => Math.min(...ns),
  MAX: (ns) => Math.max(...ns),
}

class FormulaError extends Error {}

/** Evaluates a cell's raw text. Non-formula text parses as a number if possible, else is returned as-is. */
export function evaluateCell(raw: string, grid: Grid, visiting: Set<string> = new Set()): number | string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('=')) {
    if (trimmed === '') return ''
    const n = Number(trimmed)
    return Number.isNaN(n) ? trimmed : n
  }

  const key = `${trimmed}`
  if (visiting.has(key)) throw new FormulaError('#CIRCULAR')

  function cellValue(col: number, row: number): number {
    if (row < 0 || row >= grid.rows || col < 0 || col >= grid.cols) return 0
    const cellKey = `${col},${row}`
    if (visiting.has(cellKey)) throw new FormulaError('#CIRCULAR')
    const next = new Set(visiting)
    next.add(cellKey)
    const v = evaluateCell(grid.get(row, col), grid, next)
    return typeof v === 'number' ? v : Number(v) || 0
  }

  // `$` (absolute refs like $A$1) only matters when filling; evaluating ignores it.
  const tokens = tokenize(trimmed.slice(1).replace(/\$/g, ''))
  let pos = 0
  function peek(): Token | undefined { return tokens[pos] }
  function next(): Token {
    const t = tokens[pos]
    if (!t) throw new FormulaError('#SYNTAX')
    pos++
    return t
  }
  function expectOp(v: OpValue): void {
    const t = next()
    if (t.type !== 'op' || t.value !== v) throw new FormulaError('#SYNTAX')
  }

  function parseExpr(): number {
    let left = parseTerm()
    for (;;) {
      const t = peek()
      if (t?.type === 'op' && (t.value === '+' || t.value === '-')) {
        next()
        const right = parseTerm()
        left = t.value === '+' ? left + right : left - right
      } else break
    }
    return left
  }

  function parseTerm(): number {
    let left = parsePower()
    for (;;) {
      const t = peek()
      if (t?.type === 'op' && (t.value === '*' || t.value === '/')) {
        next()
        const right = parsePower()
        left = t.value === '*' ? left * right : left / right
      } else break
    }
    return left
  }

  function parsePower(): number {
    const base = parseUnary()
    const t = peek()
    if (t?.type === 'op' && t.value === '^') {
      next()
      return Math.pow(base, parsePower())
    }
    return base
  }

  function parseUnary(): number {
    const t = peek()
    if (t?.type === 'op' && t.value === '-') { next(); return -parseUnary() }
    return parsePrimary()
  }

  // One cell's number for an aggregate: empty and text cells are skipped (as in
  // Excel's SUM/AVERAGE), an error inside the range is passed on. For whole
  // column/row ranges the formula's own cell is part of the range, so a
  // circular hit there is skipped instead of failing (`=SUM(A:A)` typed in A10).
  function rangeCell(col: number, row: number, skipCircular: boolean): number | null {
    const raw = grid.get(row, col)
    if (raw.trim() === '') return null
    const cellKey = `${col},${row}`
    if (visiting.has(cellKey)) return skipCircular ? null : (() => { throw new FormulaError('#CIRCULAR') })()
    const nextVisiting = new Set(visiting)
    nextVisiting.add(cellKey)
    const v = evaluateCell(raw, grid, nextVisiting)
    if (typeof v === 'number') return v
    if (v === '#CIRCULAR' && skipCircular) return null
    if (v.startsWith('#')) throw new FormulaError(v)
    return null // text
  }

  function parseRangeNums(aCol: number, aRow: number, bCol: number, bRow: number, whole = false): number[] {
    const nums: number[] = []
    const c0 = Math.min(aCol, bCol), c1 = Math.max(aCol, bCol)
    const r0 = Math.min(aRow, bRow), r1 = Math.max(aRow, bRow)
    for (let r = Math.max(r0, 0); r <= Math.min(r1, grid.rows - 1); r++) {
      for (let c = Math.max(c0, 0); c <= Math.min(c1, grid.cols - 1); c++) {
        const n = rangeCell(c, r, whole)
        if (n !== null) nums.push(n)
      }
    }
    return nums
  }

  function parsePrimary(): number {
    const t = next()
    if (t.type === 'num') return t.value
    if (t.type === 'cell') return cellValue(t.col, t.row)
    if (t.type === 'ident') {
      const fn = AGGREGATES[t.value]
      if (!fn) throw new FormulaError(`#NAME?`)
      expectOp('(')
      const nums: number[] = []
      for (;;) {
        const a = peek()
        const b = tokens[pos + 1]
        const c = tokens[pos + 2]
        if (a?.type === 'ident' && !AGGREGATES[a.value] && b?.type === 'op' && b.value === ':' && c?.type === 'ident') {
          // Whole columns: A:A, A:C
          next(); next(); next()
          nums.push(...parseRangeNums(colLetterToIndex(a.value), 0, colLetterToIndex(c.value), grid.rows - 1, true))
        } else if (a?.type === 'num' && b?.type === 'op' && b.value === ':' && c?.type === 'num') {
          // Whole rows: 1:1, 2:5
          next(); next(); next()
          nums.push(...parseRangeNums(0, a.value - 1, grid.cols - 1, c.value - 1, true))
        } else if (a?.type === 'cell' && b?.type === 'op' && b.value === ':') {
          next(); next()
          const c2 = next()
          if (c2.type !== 'cell') throw new FormulaError('#SYNTAX')
          nums.push(...parseRangeNums(a.col, a.row, c2.col, c2.row))
        } else {
          nums.push(parseExpr())
        }
        const sep = peek()
        if (sep?.type === 'op' && sep.value === ',') { next(); continue }
        break
      }
      expectOp(')')
      return fn(nums)
    }
    if (t.type === 'op' && t.value === '(') {
      const v = parseExpr()
      expectOp(')')
      return v
    }
    throw new FormulaError('#SYNTAX')
  }

  try {
    const result = parseExpr()
    if (pos !== tokens.length) throw new FormulaError('#SYNTAX')
    return result
  } catch (err) {
    if (err instanceof FormulaError) return err.message
    throw err
  }
}

/**
 * Moves the cell references in a formula, like copying it to another cell in a
 * spreadsheet: `=A1+B1` filled one row down becomes `=A2+B2`. A `$` pins that
 * part (`$A1` keeps column A, `A$1` keeps row 1). Text that isn't a formula is
 * returned unchanged. A reference pushed off the sheet becomes `#REF`, which
 * shows as an error rather than silently pointing somewhere else.
 */
export function shiftFormula(raw: string, dRows: number, dCols: number): string {
  if (!raw.trim().startsWith('=')) return raw
  return raw.replace(/(?<![A-Za-z0-9_$])(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g,
    (_m, absCol: string, letters: string, absRow: string, digits: string) => {
      const col = colLetterToIndex(letters) + (absCol ? 0 : dCols)
      const row = Number(digits) + (absRow ? 0 : dRows)
      if (col < 0 || row < 1) return '#REF'
      return `${absCol}${colIndexToLetter(col)}${absRow}${row}`
    })
}

/** Evaluates the cell at (row, col), knowing where it sits so a formula can't count itself. */
export function evaluateAt(grid: Grid, row: number, col: number): number | string {
  return evaluateCell(grid.get(row, col), grid, new Set([`${col},${row}`]))
}
