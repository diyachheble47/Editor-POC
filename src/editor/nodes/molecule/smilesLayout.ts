// SMILES -> atoms and bonds in our own molecule format, using SmilesDrawer for
// the hard part (parsing, ring detection and a good 2D layout). The block keeps
// drawing and editing the result itself, so the molecule stays editable (drag
// atoms, change bonds) and the library is only used here, once, on demand.
// The dynamic import keeps SmilesDrawer out of the main bundle.

import { makePointId } from '../_shared/plane'
import type { Atom, Bond } from './MoleculeNode'

const VALENCE: Record<string, number> = { H: 1, C: 4, N: 3, O: 2, S: 2, P: 3, F: 1, Cl: 1, Br: 1, I: 1 }
const UNIT = 2 / 30 // SmilesDrawer's bond length is 30 px; ours is 2 plane units

type Result = { atoms: Atom[]; bonds: Bond[] } | { error: string }

/** Alternating double bonds for aromatic rings: one double bond per aromatic atom. */
function kekulize(n: number, aromatic: [number, number][]): Set<number> {
  const adj = new Map<number, [number, number][]>() // atom -> [neighbour, edge index]
  aromatic.forEach(([a, b], i) => {
    adj.set(a, [...(adj.get(a) ?? []), [b, i]])
    adj.set(b, [...(adj.get(b) ?? []), [a, i]])
  })
  const matchOf = new Map<number, number>() // atom -> edge index
  const tryAtom = (a: number, seen: Set<number>): boolean => {
    for (const [b, e] of adj.get(a) ?? []) {
      if (seen.has(b)) continue
      seen.add(b)
      const cur = matchOf.get(b)
      if (cur === undefined || tryAtom(aromatic[cur][0] === b ? aromatic[cur][1] : aromatic[cur][0], seen)) {
        matchOf.set(a, e); matchOf.set(b, e)
        return true
      }
    }
    return false
  }
  for (let a = 0; a < n; a++) if (adj.has(a) && !matchOf.has(a)) tryAtom(a, new Set([a]))
  return new Set(matchOf.values())
}

export async function atomsFromSmiles(smiles: string): Promise<Result> {
  const text = smiles.trim()
  if (!text || text.length > 200) return { error: 'Type a SMILES string, e.g. CC(=O)O' }
  let SD
  try {
    SD = (await import('smiles-drawer')).default
  } catch {
    return { error: 'Could not load the molecule drawer.' }
  }
  try {
    const tree = SD.Parser.parse(text)
    const drawer = new SD.SvgDrawer({}).preprocessor
    drawer.initDraw(tree, 'light', false, [])
    drawer.processGraph()
    const { vertices, edges } = drawer.graph as {
      vertices: { value: { element: string }; position: { x: number; y: number } }[]
      edges: { sourceId: number; targetId: number; bondType: string; isPartOfAromaticRing: boolean }[]
    }
    if (!vertices.length) return { error: 'Empty molecule.' }

    const xs = vertices.map(v => v.position.x), ys = vertices.map(v => v.position.y)
    const mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2

    const aromaticIdx = edges.map((e, i) => (e.isPartOfAromaticRing && e.bondType === '-' ? i : -1)).filter(i => i >= 0)
    const dbl = kekulize(edges.length, aromaticIdx.map(i => [edges[i].sourceId, edges[i].targetId]))
    const order = edges.map((e, i): 1 | 2 | 3 => {
      if (e.bondType === '=') return 2
      if (e.bondType === '#') return 3
      const k = aromaticIdx.indexOf(i)
      return k >= 0 && dbl.has(k) ? 2 : 1
    })

    const sums = vertices.map(() => 0)
    edges.forEach((e, i) => { sums[e.sourceId] += order[i]; sums[e.targetId] += order[i] })

    const atoms: Atom[] = vertices.map((v, i) => {
      const element = v.value.element
      const h = element !== 'C' && element in VALENCE ? Math.max(0, VALENCE[element] - sums[i]) : 0
      return {
        id: makePointId(), element,
        x: (v.position.x - mx) * UNIT, y: -(v.position.y - my) * UNIT,
        ...(h ? { h } : {}),
      }
    })
    const bonds: Bond[] = edges.map((e, i) => ({ a: atoms[e.sourceId].id, b: atoms[e.targetId].id, order: order[i] }))
    return { atoms, bonds }
  } catch {
    return { error: 'Could not read that SMILES string.' }
  }
}
