// Turns a parsed equation into one clear, human-readable validation
// message — this is what decides what the small status line under the
// equation editor says (e.g. "Equation is valid but not balanced.").

import { parseFormula } from './formula'
import { findInvalidFormula, parseEquation } from './reaction'
import type { ParsedEquation, Term } from './reaction'

export type ValidationStatus =
  | 'empty'
  | 'incomplete'
  | 'invalid-element'
  | 'unbalanced'
  | 'balanced'
  | 'valid-formula'
  | 'valid-ion'

export interface ValidationResult {
  status: ValidationStatus
  message: string
  parsed: ParsedEquation | null
}

function sumElementCounts(terms: Term[]): Record<string, number> | null {
  const total: Record<string, number> = {}
  for (const term of terms) {
    const counts = parseFormula(term.formula)
    if (!counts) return null
    for (const el in counts) {
      total[el] = (total[el] || 0) + counts[el] * term.coefficient
    }
  }
  return total
}

function countsEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if ((a[key] || 0) !== (b[key] || 0)) return false
  }
  return true
}

export function validateEquation(rawInput: string): ValidationResult {
  if (!rawInput.trim()) {
    return { status: 'empty', message: '', parsed: null }
  }

  const parsed = parseEquation(rawInput)
  if (!parsed) {
    return {
      status: 'incomplete',
      message: 'Equation looks incomplete — check both sides of the arrow.',
      parsed: null,
    }
  }

  const invalidFormula = findInvalidFormula(parsed)
  if (invalidFormula) {
    return {
      status: 'invalid-element',
      message: `"${invalidFormula}" isn't a recognized chemical formula.`,
      parsed,
    }
  }

  if (parsed.type === 'formula') {
    return { status: 'valid-formula', message: 'Valid chemical formula.', parsed }
  }
  if (parsed.type === 'ion') {
    return { status: 'valid-ion', message: 'Valid ion.', parsed }
  }

  const leftCounts = sumElementCounts(parsed.reactants)
  const rightCounts = sumElementCounts(parsed.products)
  if (!leftCounts || !rightCounts) {
    return { status: 'invalid-element', message: 'Invalid chemical element or formula.', parsed }
  }

  if (countsEqual(leftCounts, rightCounts)) {
    return { status: 'balanced', message: 'Equation is balanced.', parsed }
  }
  return { status: 'unbalanced', message: 'Equation is valid but not balanced.', parsed }
}
