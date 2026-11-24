import { describe, expect, it } from 'vitest'
import { plotToLatex } from './latex'

describe('plotToLatex', () => {
  it('renders powers, fractions, roots and functions', () => {
    expect(plotToLatex('x^2 + 1')).toBe('y = x^{2} + 1')
    expect(plotToLatex('1/x')).toBe('y = \\frac{1}{x}')
    expect(plotToLatex('sqrt(x)')).toBe('y = \\sqrt{x}')
    expect(plotToLatex('2x')).toBe('y = 2 x')
    expect(plotToLatex('sin(pi*x)')).toBe('y = \\sin\\left(\\pi \\cdot x\\right)')
  })
  it('returns null for garbage', () => {
    expect(plotToLatex('x +')).toBeNull()
  })
})
