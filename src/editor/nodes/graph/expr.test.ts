import { describe, expect, it } from 'vitest'
import { compileExpr } from './expr'

const at = (src: string, x: number) => compileExpr(src)(x)

describe('compileExpr', () => {
  it('evaluates the basics', () => {
    expect(at('x^2 + 1', 3)).toBe(10)
    expect(at('2*x+1', 4)).toBe(9)
    expect(at('-x^2', 3)).toBe(-9)
    expect(at('2^3^2', 0)).toBe(512) // right-associative
    expect(at('sin(0) + cos(0)', 0)).toBe(1)
  })

  it('understands the way a teacher writes maths (implicit multiplication)', () => {
    expect(at('2x+1', 4)).toBe(9)
    expect(at('3x^2', 2)).toBe(12)
    expect(at('x(x+1)', 3)).toBe(12)
    expect(at('(x+1)(x-1)', 3)).toBe(8)
    expect(at('2sin(x)', Math.PI / 2)).toBeCloseTo(2)
    expect(at('4pi', 0)).toBeCloseTo(4 * Math.PI)
  })

  it('accepts y = and f(x) = prefixes, capital X, and common symbols', () => {
    expect(at('y = x^2', 3)).toBe(9)
    expect(at('f(x)=2x', 3)).toBe(6)
    expect(at('X+1', 1)).toBe(2)
    expect(at('x² + 1', 3)).toBe(10)
    expect(at('x³', 2)).toBe(8)
    expect(at('2×x', 3)).toBe(6)
    expect(at('x − 1', 3)).toBe(2)
    expect(at('π', 0)).toBeCloseTo(Math.PI)
  })

  it('has the usual functions and constants', () => {
    expect(at('ln(e)', 0)).toBeCloseTo(1)
    expect(at('log(100)', 0)).toBeCloseTo(2) // log is base 10, ln is natural
    expect(at('sqrt(16)', 0)).toBe(4)
    expect(at('abs(x)', -5)).toBe(5)
    expect(at('atan(1)', 0)).toBeCloseTo(Math.PI / 4)
  })

  it('rejects things that are not maths, without running them', () => {
    for (const bad of ['alert(1)', 'x +', '(x', 'foo(x)', 'x; y', '__proto__', 'constructor(x)', 'constructor', '']) {
      expect(() => compileExpr(bad)).toThrow()
    }
  })
})
