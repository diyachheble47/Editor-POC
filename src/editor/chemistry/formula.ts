// Parses a single chemical formula (e.g. "H2O", "Ca(OH)2", "CuSO4.5H2O")
// into a count of each element, e.g. { Ca: 1, O: 2, H: 2 }.
//
// This is plain parsing logic — no chemistry library does this for us,
// because it depends on our specific plain-text shorthand. Rendering
// (turning the formula into pretty subscripts) is a completely separate
// concern handled by KaTeX/mhchem elsewhere; this file only counts atoms,
// which is what the balancer and the validator both need.

import { isValidElementSymbol } from './elements'

export type ElementCounts = Record<string, number>

function mergeCounts(target: ElementCounts, source: ElementCounts, multiplier: number) {
  for (const element in source) {
    target[element] = (target[element] || 0) + source[element] * multiplier
  }
}

// Parses a bracketed/plain run of the formula starting at `pos`, stopping
// at a closing ) or ] or the end of the string. Returns the counts found
// and the position just after the last character consumed.
function parseGroup(formula: string, pos: number): { counts: ElementCounts; pos: number } | null {
  const counts: ElementCounts = {}

  while (pos < formula.length && formula[pos] !== ')' && formula[pos] !== ']') {
    const char = formula[pos]

    if (char === '(' || char === '[') {
      const closeChar = char === '(' ? ')' : ']'
      const inner = parseGroup(formula, pos + 1)
      if (!inner) return null
      if (formula[inner.pos] !== closeChar) return null // mismatched brackets
      pos = inner.pos + 1

      const digitsMatch = formula.slice(pos).match(/^\d+/)
      const multiplier = digitsMatch ? parseInt(digitsMatch[0], 10) : 1
      pos += digitsMatch ? digitsMatch[0].length : 0

      mergeCounts(counts, inner.counts, multiplier)
      continue
    }

    if (!/[A-Z]/.test(char)) return null // expected an element symbol here

    const twoLetter = formula.slice(pos, pos + 2)
    const oneLetter = char
    let symbol: string
    if (/^[A-Z][a-z]$/.test(twoLetter) && isValidElementSymbol(twoLetter)) {
      symbol = twoLetter
    } else if (isValidElementSymbol(oneLetter)) {
      symbol = oneLetter
    } else {
      return null // not a real element symbol
    }
    pos += symbol.length

    const digitsMatch = formula.slice(pos).match(/^\d+/)
    const count = digitsMatch ? parseInt(digitsMatch[0], 10) : 1
    pos += digitsMatch ? digitsMatch[0].length : 0

    counts[symbol] = (counts[symbol] || 0) + count
  }

  return { counts, pos }
}

// Splits "CuSO4.5H2O" into ["CuSO4", "5H2O"] — hydrate dots only, not
// dots inside brackets (there aren't any in practice, but stay safe).
function splitOnDots(formula: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of formula) {
    if (char === '(' || char === '[') depth++
    if (char === ')' || char === ']') depth--
    if (char === '.' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts
}

// "e-" / "e^-" represents a free electron in redox half-reactions. It's
// not a real element, but it's valid chemistry shorthand, so we treat it
// as its own special case with zero atoms.
export function isElectronSymbol(formula: string): boolean {
  return formula === 'e'
}

export function parseFormula(formula: string): ElementCounts | null {
  if (!formula) return null
  if (isElectronSymbol(formula)) return {}

  const total: ElementCounts = {}
  for (const segment of splitOnDots(formula)) {
    const multMatch = segment.match(/^\d+/)
    const multiplier = multMatch ? parseInt(multMatch[0], 10) : 1
    const rest = segment.slice(multMatch ? multMatch[0].length : 0)
    if (!rest) return null

    const result = parseGroup(rest, 0)
    if (!result || result.pos !== rest.length) return null

    mergeCounts(total, result.counts, multiplier)
  }
  return total
}
