// Parses a full chemistry input — a formula, an ion, or a whole reaction —
// into a structured shape the rest of the app (validator, balancer,
// renderer) can work with. This is the "smart chemical input" layer: it
// turns plain shorthand like "2H2 + O2 -> 2H2O" into structured data
// instead of just a string.

import { parseFormula } from './formula'

export type EquationType = 'formula' | 'ion' | 'reaction' | 'equilibrium'
export type ChemState = 's' | 'l' | 'g' | 'aq'

export interface Term {
  coefficient: number
  formula: string
  state?: ChemState
  charge?: string
}

export interface ParsedEquation {
  type: EquationType
  reactants: Term[]
  products: Term[]
  conditionAbove?: string
  conditionBelow?: string
}

function collapseWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, ' ')
}

// Splits "2H2 + O2" into ["2H2", "O2"] on top-level " + " only (not
// inside brackets — there aren't normally any, but this stays safe for
// things like complex ions written as [Cu(NH3)4]2+).
function splitTerms(side: string): string[] {
  const terms: string[] = []
  let depth = 0
  let current = ''
  for (let i = 0; i < side.length; i++) {
    const char = side[i]
    if (char === '(' || char === '[') depth++
    if (char === ')' || char === ']') depth--
    if (depth === 0 && char === '+' && side[i - 1] === ' ' && side[i + 1] === ' ') {
      terms.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) terms.push(current.trim())
  return terms.filter(Boolean)
}

function parseTerm(raw: string): Term {
  let text = raw.trim()

  const coefficientMatch = text.match(/^\d+/)
  const coefficient = coefficientMatch ? parseInt(coefficientMatch[0], 10) : 1
  if (coefficientMatch) text = text.slice(coefficientMatch[0].length)

  let state: ChemState | undefined
  const stateMatch = text.match(/\((s|l|g|aq)\)$/i)
  if (stateMatch) {
    state = stateMatch[1].toLowerCase() as ChemState
    text = text.slice(0, stateMatch.index)
  }

  let charge: string | undefined
  const chargeMatch = text.match(/\^?\d*[+-]+$/)
  if (chargeMatch) {
    charge = chargeMatch[0].replace(/^\^/, '')
    text = text.slice(0, chargeMatch.index)
  }

  return { coefficient, formula: text, state, charge }
}

function detectArrow(
  input: string,
): { type: 'equilibrium' | 'forward'; index: number; length: number } | null {
  const equilibrium = input.match(/<=>|<->>?/)
  if (equilibrium) {
    return { type: 'equilibrium', index: equilibrium.index!, length: equilibrium[0].length }
  }
  const forward = input.match(/->/)
  if (forward) {
    return { type: 'forward', index: forward.index!, length: forward[0].length }
  }
  return null
}

export function parseEquation(rawInput: string): ParsedEquation | null {
  const input = collapseWhitespace(rawInput)
  if (!input) return null

  const arrow = detectArrow(input)

  if (!arrow) {
    const term = parseTerm(input)
    const type: EquationType = term.charge ? 'ion' : 'formula'
    return { type, reactants: [term], products: [] }
  }

  const leftText = input.slice(0, arrow.index).trim()
  let rightText = input.slice(arrow.index + arrow.length)

  // Reaction conditions written right after the arrow, e.g. "->[\Delta]"
  // or "->[catalyst][cooling]" for above/below the arrow.
  let conditionAbove: string | undefined
  let conditionBelow: string | undefined
  const conditionMatch = rightText.match(/^\s*(\[[^\]]*\])?(\[[^\]]*\])?/)
  if (conditionMatch && (conditionMatch[1] || conditionMatch[2])) {
    if (conditionMatch[1]) conditionAbove = conditionMatch[1].slice(1, -1)
    if (conditionMatch[2]) conditionBelow = conditionMatch[2].slice(1, -1)
    rightText = rightText.slice(conditionMatch[0].length)
  }

  if (!leftText || !rightText.trim()) return null // incomplete reaction

  const reactants = splitTerms(leftText).map(parseTerm)
  const products = splitTerms(rightText.trim()).map(parseTerm)

  return {
    type: arrow.type === 'equilibrium' ? 'equilibrium' : 'reaction',
    reactants,
    products,
    conditionAbove,
    conditionBelow,
  }
}

// Checks that every term's formula is real chemistry (recognized elements),
// separately from structural parsing above. Kept separate so "the input
// doesn't parse as a reaction yet" and "the input has a fake element" are
// two different, clearly distinguishable failure cases.
export function findInvalidFormula(equation: ParsedEquation): string | null {
  for (const term of [...equation.reactants, ...equation.products]) {
    if (parseFormula(term.formula) === null) return term.formula
  }
  return null
}
