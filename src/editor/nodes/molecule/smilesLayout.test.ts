import { describe, it, expect } from 'vitest'
import { atomsFromSmiles } from './smilesLayout'

describe('atomsFromSmiles', () => {
  it('benzoyl peroxide: 18 heavy atoms, 8 double bonds (2 Kekulé rings + 2 C=O)', async () => {
    const r = await atomsFromSmiles('O=C(c1ccccc1)OOC(=O)c1ccccc1')
    if ('error' in r) throw new Error(r.error)
    expect(r.atoms).toHaveLength(18)
    expect(r.bonds).toHaveLength(19)
    expect(r.bonds.filter(b => b.order === 2)).toHaveLength(8)
    const ids = new Set(r.atoms.map(a => a.id))
    expect(r.bonds.every(b => ids.has(b.a) && ids.has(b.b))).toBe(true)
  })

  it('shows implicit hydrogens on hetero atoms (acetic acid has one OH)', async () => {
    const r = await atomsFromSmiles('CC(=O)O')
    if ('error' in r) throw new Error(r.error)
    expect(r.atoms.filter(a => a.element === 'O' && a.h === 1)).toHaveLength(1)
    expect(r.atoms.filter(a => a.element === 'O' && !a.h)).toHaveLength(1)
  })

  it('rejects junk', async () => {
    expect('error' in (await atomsFromSmiles('not a molecule ((('))).toBe(true)
  })
})
