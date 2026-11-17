// Atom layouts for the molecules the AI can ask for by name. The AI never
// supplies coordinates (it gets them wrong); the sketcher's own units apply:
// a bond is about 2 units long, y points up.
import { makePointId } from './nodes/_shared/plane'
import type { Atom, Bond } from './nodes/molecule/MoleculeNode'

type Spec = { atoms: [string, number, number][]; bonds: [number, number, 1 | 2 | 3][] }

const D = 1.73 // x step of a 30° zigzag bond of length 2 (the y step is 1)

const ring = (orders: (1 | 2)[]): Spec => {
  const atoms: [string, number, number][] = []
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3
    atoms.push(['C', 2 * Math.cos(a), 2 * Math.sin(a)])
  }
  return { atoms, bonds: atoms.map((_, i) => [i, (i + 1) % 6, orders[i % orders.length]] as [number, number, 1 | 2]) }
}

export const MOLECULE_LAYOUTS: Record<string, Spec> = {
  water: { atoms: [['O', 0, 0], ['H', -1.6, -1.2], ['H', 1.6, -1.2]], bonds: [[0, 1, 1], [0, 2, 1]] },
  ammonia: {
    atoms: [['N', 0, 0], ['H', -2, -1.2], ['H', 0, -2], ['H', 2, -1.2]],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]],
  },
  methane: {
    atoms: [['C', 0, 0], ['H', 0, 2], ['H', 0, -2], ['H', -2, 0], ['H', 2, 0]],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]],
  },
  carbon_dioxide: { atoms: [['O', -3, 0], ['C', 0, 0], ['O', 3, 0]], bonds: [[0, 1, 2], [1, 2, 2]] },
  ethene: {
    atoms: [['C', -1, 0], ['C', 1, 0], ['H', -2.2, 1.2], ['H', -2.2, -1.2], ['H', 2.2, 1.2], ['H', 2.2, -1.2]],
    bonds: [[0, 1, 2], [0, 2, 1], [0, 3, 1], [1, 4, 1], [1, 5, 1]],
  },
  propane: { atoms: [['C', 0, 0], ['C', D, 1], ['C', 2 * D, 0]], bonds: [[0, 1, 1], [1, 2, 1]] },
  ethanol: {
    atoms: [['C', 0, 0], ['C', D, 1], ['O', 2 * D, 0], ['H', 2 * D, -1.6]],
    bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 1]],
  },
  acetic_acid: {
    atoms: [['C', 0, 0], ['C', D, 1], ['O', D, 3], ['O', 2 * D, 0], ['H', 2 * D, -1.6]],
    bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1]],
  },
  benzene: ring([2, 1]),
  cyclohexane: ring([1]),
}

export function moleculeFromName(name: string): { atoms: Atom[]; bonds: Bond[] } | null {
  const spec = MOLECULE_LAYOUTS[name]
  if (!spec) return null
  const atoms: Atom[] = spec.atoms.map(([element, x, y]) => ({ id: makePointId(), element, x, y }))
  const bonds: Bond[] = spec.bonds.map(([a, b, order]) => ({ a: atoms[a].id, b: atoms[b].id, order }))
  return { atoms, bonds }
}
