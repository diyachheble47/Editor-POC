import { describe, expect, it } from 'vitest'
import { evaluateAt, evaluateCell, shiftFormula } from './formula'
import type { Grid } from './formula'

const gridOf = (cells: string[][]): Grid => ({
  rows: cells.length,
  cols: cells[0].length,
  get: (r, c) => cells[r]?.[c] ?? '',
})

describe('shiftFormula', () => {
  it('moves relative references like a spreadsheet fill', () => {
    expect(shiftFormula('=A1+B1', 1, 0)).toBe('=A2+B2')
    expect(shiftFormula('=A1+B1', 3, 0)).toBe('=A4+B4')
    expect(shiftFormula('=A1*2', 0, 2)).toBe('=C1*2')
  })

  it('moves ranges and keeps functions intact', () => {
    expect(shiftFormula('=SUM(A1:A3)', 0, 1)).toBe('=SUM(B1:B3)')
    expect(shiftFormula('=AVERAGE(A1:B1)', 2, 0)).toBe('=AVERAGE(A3:B3)')
  })

  it('keeps $-pinned parts fixed', () => {
    expect(shiftFormula('=$A1+B$1', 2, 1)).toBe('=$A3+C$1')
    expect(shiftFormula('=$A$1*B1', 1, 0)).toBe('=$A$1*B2')
  })

  it('leaves plain text and numbers alone, and flags references pushed off the sheet', () => {
    expect(shiftFormula('Total', 1, 0)).toBe('Total')
    expect(shiftFormula('42', 1, 0)).toBe('42')
    expect(shiftFormula('=A1', -1, 0)).toBe('=#REF')
  })
})

describe('filled formulas evaluate per row', () => {
  it('C = A + B in every row from one typed formula', () => {
    const cells = [['1', '10', ''], ['2', '20', ''], ['3', '30', '']]
    for (let r = 0; r < 3; r++) cells[r][2] = shiftFormula('=A1+B1', r, 0)
    const g = gridOf(cells)
    expect([0, 1, 2].map(r => evaluateCell(cells[r][2], g))).toEqual([11, 22, 33])
  })

  it('evaluates $-pinned references', () => {
    const g = gridOf([['5', '=$A$1*2']])
    expect(evaluateCell('=$A$1*2', g)).toBe(10)
  })
})

describe('whole column / row ranges', () => {
  const g = gridOf([
    ['Name', 'Qty', ''],
    ['a', '10', '1'],
    ['b', '20', '2'],
    ['c', '30', '3'],
  ])
  it('SUM(A:B) / SUM(B:B) add every number in the columns and skip text', () => {
    expect(evaluateCell('=SUM(B:B)', g)).toBe(60)
    expect(evaluateCell('=SUM(A:B)', g)).toBe(60)
    expect(evaluateCell('=SUM(B:C)', g)).toBe(66)
  })
  it('AVERAGE ignores header text and empty cells', () => {
    expect(evaluateCell('=AVERAGE(B:B)', g)).toBe(20)
    expect(evaluateCell('=MAX(B2:B4)', g)).toBe(30)
  })
  it('whole rows', () => {
    expect(evaluateCell('=SUM(2:2)', g)).toBe(11)
    expect(evaluateCell('=SUM(2:4)', g)).toBe(66)
  })
  it('a total inside its own column does not count itself or fail', () => {
    const own = gridOf([['5'], ['7'], ['=SUM(A:A)']])
    expect(evaluateAt(own, 2, 0)).toBe(12)
  })
  it('still reports unknown names', () => {
    expect(evaluateCell('=FOO(A1)', g)).toBe('#NAME?')
  })
})
