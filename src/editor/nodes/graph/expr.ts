// A tiny, safe math expression parser/evaluator for the Graph block's
// function plotting (e.g. "x^2 + 1", "sin(x) * 2"). Deliberately NOT using
// eval()/new Function() — this only ever understands numbers, '+ - * / ^',
// parentheses, the variable x, and a small whitelist of function names, so
// there is no way for a typed expression to execute arbitrary code.

const FUNCS: Record<string, (n: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  log: Math.log,
  exp: Math.exp,
}

type Token =
  | { type: 'num'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: '+' | '-' | '*' | '/' | '^' | '(' | ')' }

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === ' ' || ch === '\t') { i++; continue }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j++
      const num = Number(src.slice(i, j))
      if (Number.isNaN(num)) throw new Error(`Bad number at ${i}`)
      tokens.push({ type: 'num', value: num })
      i = j
      continue
    }
    if (/[a-zA-Z]/.test(ch)) {
      let j = i
      while (j < src.length && /[a-zA-Z]/.test(src[j])) j++
      tokens.push({ type: 'ident', value: src.slice(i, j) })
      i = j
      continue
    }
    if ('+-*/^()'.includes(ch)) {
      tokens.push({ type: 'op', value: ch as '+' | '-' | '*' | '/' | '^' | '(' | ')' })
      i++
      continue
    }
    throw new Error(`Unexpected character "${ch}"`)
  }
  return tokens
}

/** Compiles a math expression in `x` into a function. Throws on invalid syntax. */
export function compileExpr(src: string): (x: number) => number {
  const tokens = tokenize(src)
  let pos = 0

  function peek(): Token | undefined { return tokens[pos] }
  function next(): Token {
    const t = tokens[pos]
    if (!t) throw new Error('Unexpected end of expression')
    pos++
    return t
  }

  function parseExpr(): (x: number) => number {
    let left = parseTerm()
    for (;;) {
      const t = peek()
      if (t?.type === 'op' && (t.value === '+' || t.value === '-')) {
        next()
        const right = parseTerm()
        const l = left
        left = t.value === '+' ? (x) => l(x) + right(x) : (x) => l(x) - right(x)
      } else break
    }
    return left
  }

  function parseTerm(): (x: number) => number {
    let left = parsePower()
    for (;;) {
      const t = peek()
      if (t?.type === 'op' && (t.value === '*' || t.value === '/')) {
        next()
        const right = parsePower()
        const l = left
        left = t.value === '*' ? (x) => l(x) * right(x) : (x) => l(x) / right(x)
      } else break
    }
    return left
  }

  function parsePower(): (x: number) => number {
    const base = parseUnary()
    const t = peek()
    if (t?.type === 'op' && t.value === '^') {
      next()
      const exp = parsePower() // right-associative
      return (x) => Math.pow(base(x), exp(x))
    }
    return base
  }

  function parseUnary(): (x: number) => number {
    const t = peek()
    if (t?.type === 'op' && t.value === '-') {
      next()
      const inner = parseUnary()
      return (x) => -inner(x)
    }
    return parsePrimary()
  }

  function parsePrimary(): (x: number) => number {
    const t = next()
    if (t.type === 'num') {
      const v = t.value
      return () => v
    }
    if (t.type === 'ident') {
      if (t.value === 'x') return (x) => x
      const fn = FUNCS[t.value]
      if (!fn) throw new Error(`Unknown function "${t.value}"`)
      const open = next()
      if (open.type !== 'op' || open.value !== '(') throw new Error(`Expected "(" after ${t.value}`)
      const arg = parseExpr()
      const close = next()
      if (close.type !== 'op' || close.value !== ')') throw new Error('Expected ")"')
      return (x) => fn(arg(x))
    }
    if (t.type === 'op' && t.value === '(') {
      const inner = parseExpr()
      const close = next()
      if (close.type !== 'op' || close.value !== ')') throw new Error('Expected ")"')
      return inner
    }
    throw new Error('Unexpected token')
  }

  const result = parseExpr()
  if (pos !== tokens.length) throw new Error('Unexpected trailing input')
  // Smoke-test it once so a bad expression (e.g. unknown identifier caught
  // only at call time) fails immediately, not silently when first plotted.
  result(1)
  return result
}
