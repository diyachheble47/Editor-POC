// Turns a structured ParsedEquation (e.g. after balancing) back into the
// same plain-text shorthand the user types, e.g. "4Fe + 3O2 -> 2Fe2O3".
// This keeps the input box always showing editable plain text — never a
// separate "rendered-only" representation the user can't get back to.

import type { ParsedEquation, Term } from './reaction'

function formatTerm(term: Term): string {
  let text = term.coefficient !== 1 ? String(term.coefficient) : ''
  text += term.formula
  if (term.charge) text += `^${term.charge}`
  if (term.state) text += `(${term.state})`
  return text
}

function formatSide(terms: Term[]): string {
  return terms.map(formatTerm).join(' + ')
}

function formatArrow(equation: ParsedEquation): string {
  let arrow = equation.type === 'equilibrium' ? '<=>' : '->'
  if (equation.conditionAbove || equation.conditionBelow) {
    arrow += `[${equation.conditionAbove || ''}]`
    if (equation.conditionBelow) arrow += `[${equation.conditionBelow}]`
  }
  return arrow
}

export function formatEquation(equation: ParsedEquation): string {
  if (equation.type === 'formula' || equation.type === 'ion') {
    return formatTerm(equation.reactants[0])
  }
  return `${formatSide(equation.reactants)} ${formatArrow(equation)} ${formatSide(equation.products)}`
}
