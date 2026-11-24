// Converts a typed plot expression ("x^2 + 1", "sin(x)/2", "sqrt(x)") into
// LaTeX so the Graph block can show it as a real math equation. Mirrors the
// grammar in expr.ts (same precedence, implicit multiplication) but emits
// LaTeX strings instead of closures. Callers should validate with
// compileExpr first; this throws on malformed input too.

const FN_LATEX: Record<string, string> = {
  sin: '\\sin', cos: '\\cos', tan: '\\tan',
  asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan',
  ln: '\\ln', log: '\\log', exp: '\\exp',
}

type Tok = { t: 'num' | 'id' | 'op'; v: string }

function normalize(src: string): string {
  return src
    .replace(/²/g, '^2').replace(/³/g, '^3')
    .replace(/×|·/g, '*').replace(/÷/g, '/')
    .replace(/[−–]/g, '-').replace(/π/g, 'pi')
    .replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=\s*/i, '')
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  const re = /\s*(?:([0-9.]+)|([a-zA-Z]+)|([-+*/^()]))/y
  let i = 0
  while (i < src.length) {
    if (/^\s+$/.test(src.slice(i))) break
    re.lastIndex = i
    const m = re.exec(src)
    if (!m) throw new Error('bad input')
    if (m[1] !== undefined) out.push({ t: 'num', v: m[1] })
    else if (m[2] !== undefined) out.push({ t: 'id', v: m[2] })
    else out.push({ t: 'op', v: m[3] })
    i = re.lastIndex
  }
  return out
}

export function exprToLatex(src: string): string {
  const toks = tokenize(normalize(src))
  let pos = 0
  const peek = () => toks[pos]
  const next = () => {
    const t = toks[pos++]
    if (!t) throw new Error('end')
    return t
  }
  const isOp = (t: Tok | undefined, v: string) => t?.t === 'op' && t.v === v

  function expr(): string {
    let s = term()
    for (;;) {
      const t = peek()
      if (isOp(t, '+') || isOp(t, '-')) { next(); s += ` ${t!.v} ${term()}` } else break
    }
    return s
  }
  const startsOperand = () => {
    const t = peek()
    return t?.t === 'num' || t?.t === 'id' || isOp(t, '(')
  }
  function term(): string {
    let s = unary()
    for (;;) {
      const t = peek()
      if (isOp(t, '*')) { next(); s += ` \\cdot ${unary()}` }
      else if (isOp(t, '/')) { next(); s = `\\frac{${s}}{${unary()}}` }
      else if (startsOperand()) s += ` ${power()}` // implicit multiplication: 2x
      else break
    }
    return s
  }
  function unary(): string {
    const t = peek()
    if (isOp(t, '-')) { next(); return `-${unary()}` }
    if (isOp(t, '+')) { next(); return unary() }
    return power()
  }
  function power(): string {
    const base = primary()
    if (isOp(peek(), '^')) { next(); return `${base}^{${unary()}}` }
    return base
  }
  function primary(): string {
    const t = next()
    if (t.t === 'num') return t.v
    if (t.t === 'id') {
      const n = t.v.toLowerCase()
      if (n === 'x') return 'x'
      if (n === 'pi') return '\\pi'
      if (n === 'e') return 'e'
      if (!isOp(peek(), '(')) throw new Error('fn')
      next()
      const arg = expr()
      if (!isOp(next(), ')')) throw new Error(')')
      if (n === 'sqrt') return `\\sqrt{${arg}}`
      if (n === 'abs') return `\\left|${arg}\\right|`
      if (n === 'floor') return `\\lfloor ${arg} \\rfloor`
      if (n === 'ceil') return `\\lceil ${arg} \\rceil`
      return `${FN_LATEX[n] ?? `\\operatorname{${n}}`}\\left(${arg}\\right)`
    }
    if (isOp(t, '(')) {
      const inner = expr()
      if (!isOp(next(), ')')) throw new Error(')')
      return `\\left(${inner}\\right)`
    }
    throw new Error('token')
  }

  const out = expr()
  if (pos !== toks.length) throw new Error('trailing')
  return out
}

/** LaTeX for "y = <expr>", or null if it can't be converted. */
export function plotToLatex(src: string): string | null {
  try { return `y = ${exprToLatex(src)}` } catch { return null }
}
