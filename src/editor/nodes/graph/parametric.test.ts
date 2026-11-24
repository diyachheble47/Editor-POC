import { describe, expect, it } from 'vitest'
import { checkPlot, isParametric, parseParametric } from './parametric'
import { compileExpr } from './expr'

describe('isParametric', () => {
  it('tells a parametric curve from a plain y = f(x)', () => {
    expect(isParametric('x(t) = cos(t), y(t) = sin(t), t from 0 to 2*pi')).toBe(true)
    expect(isParametric('y = x^2')).toBe(false)
    expect(isParametric('x^2 + 1')).toBe(false)
  })
})

describe('parseParametric', () => {
  it('reads a circle and its range', () => {
    const c = parseParametric('x(t) = cos(t), y(t) = sin(t), t from 0 to 2*pi')
    expect(c.x(0)).toBeCloseTo(1)
    expect(c.y(Math.PI / 2)).toBeCloseTo(1)
    expect(c.tMin).toBe(0)
    expect(c.tMax).toBeCloseTo(2 * Math.PI)
  })

  it('takes named numbers such as a = 3', () => {
    const c = parseParametric('x(t) = a*cos(t), y(t) = a*sin(t), t from 0 to pi, a = 3')
    expect(c.x(0)).toBeCloseTo(3)
    expect(c.y(Math.PI / 2)).toBeCloseTo(3)
  })

  it('accepts the parts in any order and with pi symbols', () => {
    const c = parseParametric('a = 2; y(t) = a*sin(t); t from 0 to π; x(t) = a*cos(t)')
    expect(c.x(0)).toBeCloseTo(2)
    expect(c.tMax).toBeCloseTo(Math.PI)
  })

  it('evaluates the teacher example with a = 1', () => {
    const src = 'x(t) = a*sin(t)*(exp(cos(t)) - 2*cos(4*t) - sin(t/12)^5), ' +
      'y(t) = a*cos(t)*(exp(cos(t)) - 2*cos(4*t) - sin(t/12)^5), t from 0 to 24*pi, a = 1'
    const c = parseParametric(src)
    expect(c.x(0)).toBeCloseTo(0)
    expect(c.y(0)).toBeCloseTo(Math.E - 2)
    expect(c.tMax).toBeCloseTo(24 * Math.PI)
  })

  it('explains what is missing', () => {
    expect(() => parseParametric('x(t) = cos(t), t from 0 to 2*pi')).toThrow(/both x\(t\)/)
    expect(() => parseParametric('x(t) = cos(t), y(t) = sin(t), t from 3 to 1')).toThrow(/smaller number/)
    expect(() => parseParametric('x(t) = b*cos(t), y(t) = sin(t)')).toThrow(/Unknown name "b"/)
    expect(() => parseParametric('x(t) = cos(t), y(t) = sin(t), hello')).toThrow(/Can't read/)
  })
})

describe('checkPlot', () => {
  it('validates both kinds of entry', () => {
    expect(() => checkPlot('x^2 + 1')).not.toThrow()
    expect(() => checkPlot('x(t) = cos(t), y(t) = sin(t)')).not.toThrow()
    expect(() => checkPlot('x(t) = cos(t)')).toThrow()
  })
})

describe('compileExpr options', () => {
  it('uses a different variable and named constants', () => {
    expect(compileExpr('a*t', { variable: 't', constants: { a: 4 } })(2)).toBe(8)
  })

  it('names the unknown identifier clearly', () => {
    expect(() => compileExpr('a*x')).toThrow('Unknown name "a"')
    expect(() => compileExpr('foo(x)')).toThrow('Unknown function "foo"')
  })
})
