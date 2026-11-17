import { describe, it, expect } from 'vitest'
import { moleculeFromFormula } from './formulaMolecule'

function summary(f: string) {
  const r = moleculeFromFormula(f)
  if ('error' in r) return r.error
  const count: Record<string, number> = {}
  r.atoms.forEach(a => { count[a.element] = (count[a.element] ?? 0) + 1 })
  const orders = r.bonds.map(b => b.order).sort().join('')
  return { count, orders }
}

describe('moleculeFromFormula', () => {
  it('water', () => expect(summary('H2O')).toEqual({ count: { O: 1, H: 2 }, orders: '11' }))
  it('methane', () => expect(summary('CH4')).toEqual({ count: { C: 1, H: 4 }, orders: '1111' }))
  it('CO2 has two double bonds', () => expect(summary('CO2')).toEqual({ count: { C: 1, O: 2 }, orders: '22' }))
  it('ethene has a double bond', () => expect(summary('C2H4')).toEqual({ count: { C: 2, H: 4 }, orders: '11112' }))
  it('ethanol', () => expect(summary('CH3CH2OH')).toEqual({ count: { C: 2, O: 1, H: 6 }, orders: '11111111' }))
  it('acetic acid has one C=O', () => expect(summary('CH3COOH')).toEqual({ count: { C: 2, O: 2, H: 4 }, orders: '1111112' }))
  it('acetic acid is a real carboxyl (C=O plus OH on the same carbon)', () => {
    const r = moleculeFromFormula('CH3COOH')
    if ('error' in r) throw new Error(r.error)
    const c2 = r.atoms.filter(a => a.element === 'C')[1]
    const nb = r.bonds.filter(b => b.a === c2.id || b.b === c2.id)
    expect(nb.length).toBe(3) // CH3, =O and -OH, nothing else
    expect(r.atoms.filter(a => a.element === 'O').length).toBe(2)
  })
  it('benzoyl peroxide C14H10O4: two rings, 14 C, 10 H, 4 O, 2 C=O', () => {
    const r = moleculeFromFormula('C14H10O4')
    if ('error' in r) throw new Error(r.error)
    const c: Record<string, number> = {}
    r.atoms.forEach(a => { c[a.element] = (c[a.element] ?? 0) + 1 })
    expect(c).toEqual({ C: 14, O: 4, H: 10 })
    expect(r.bonds.filter(b => b.order === 2).length).toBe(6 + 2) // 2 Kekulé x3 + 2 C=O
    const ids = new Set(r.atoms.map(a => a.id))
    expect(r.bonds.every(b => ids.has(b.a) && ids.has(b.b))).toBe(true)
  })
  it('branches and unmatched brackets', () => {
    expect(summary('CH3C(O)CH3')).toEqual({ count: { C: 3, O: 1, H: 6 }, orders: '111111112' })
    expect(typeof summary('C(O')).toBe('string')
  })
  it('rejects junk and too many H', () => {
    expect(typeof summary('Xx2')).toBe('string')
    expect(typeof summary('CH5')).toBe('string')
  })
})
