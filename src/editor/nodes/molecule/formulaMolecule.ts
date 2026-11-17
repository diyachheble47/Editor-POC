// Builds a molecule from a typed formula. Written as a CONDENSED formula: the
// order says what is bonded to what, so
//   H2O, CO2, C2H4, CH3CH2OH, CH3COOH           chains
//   CH3C(O)CH3, C(CH3)4                         ( ) = a branch on the previous atom
//   C6H5COOH, PhCH3, C6H5C(O)OOC(O)C6H5         C6H5 / Ph = a benzene-ring group
// A few well-known plain molecular formulas (C14H10O4, C2H4O2...) are mapped to
// their usual structure. Rings other than C6H5 / C6H6 are not supported.

import { makePointId } from '../_shared/plane'
import type { Atom, Bond } from './MoleculeNode'

const VALENCE: Record<string, number> = { H: 1, C: 4, N: 3, O: 2, S: 2, F: 1, Cl: 1, Br: 1 }
const BOND = 2 // bond length, in plane units

// A molecular formula alone can't say how atoms connect; these are the usual ones.
const KNOWN: Record<string, string> = {
  C14H10O4: 'C6H5C(O)OOC(O)C6H5', // benzoyl peroxide
  C2H6O: 'CH3CH2OH',
  C2H4O2: 'CH3C(O)OH',
  C3H6O: 'CH3C(O)CH3',
  C7H6O2: 'C6H5COOH',
  C6H6O: 'C6H5OH',
  C7H8: 'C6H5CH3',
  C3H8: 'CH3CH2CH3',
  C4H10: 'CH3CH2CH2CH3',
}

type Result = { atoms: Atom[]; bonds: Bond[] } | { error: string }
type Tok = { t: 'el'; s: string; n: number } | { t: '(' } | { t: ')' } | { t: 'ph' }

function tokenize(text: string): Tok[] | string {
  // (X)n -> (X)(X)... n times, so C(CH3)3 means three branches.
  let src = text
  for (let guard = 0; guard < 20; guard++) {
    const next = src.replace(/\(([^()]*)\)(\d+)/, (_, x: string, n: string) => `(${x})`.repeat(parseInt(n, 10)))
    if (next === src) break
    src = next
  }
  const out: Tok[] = []
  let pos = 0
  for (const m of src.matchAll(/Ph|\(|\)|([A-Z][a-z]?)(\d*)/g)) {
    if (m.index !== pos) break
    pos += m[0].length
    if (m[0] === '(') out.push({ t: '(' })
    else if (m[0] === ')') out.push({ t: ')' })
    else if (m[0] === 'Ph') out.push({ t: 'ph' })
    else {
      if (!(m[1] in VALENCE)) return `Unknown element "${m[1]}". Supported: H C N O S F Cl Br`
      out.push({ t: 'el', s: m[1], n: m[2] ? parseInt(m[2], 10) : 1 })
    }
  }
  if (pos !== src.length) return 'Could not read that formula. Try H2O, CH3CH2OH or CH3C(O)OH.'
  // C6H5 = phenyl group.
  const merged: Tok[] = []
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[i + 1]
    if (a.t === 'el' && a.s === 'C' && a.n === 6 && b?.t === 'el' && b.s === 'H' && b.n === 5) {
      merged.push({ t: 'ph' }); i++
    } else merged.push(a)
  }
  return merged
}

export function moleculeFromFormula(input: string, cx = 0, cy = 0): Result {
  let text = input.replace(/\s+/g, '')
  if (!text) return { error: 'Type a formula, e.g. H2O' }
  if (text === 'C6H6') return benzene(cx, cy)
  text = KNOWN[text] ?? text

  const tokens = tokenize(text)
  if (typeof tokens === 'string') return { error: tokens }

  const el: string[] = []
  const parent: number[] = []              // skeleton parent (-1 root, -2 ring member)
  const order = new Map<string, number>()  // "a-b" -> bond order
  const degree: number[] = []
  const ringStart = new Map<number, number>() // first ring atom -> index of its 6 atoms start (same)
  const fixedH: number[] = []              // hydrogens already placed (ring atoms)
  const intendedH: [number, number][] = []
  let pendingH = 0, totalH = 0
  let last = -1                            // atom the next one normally follows
  let anchor = -1                          // forced parent after ( or )
  const stack: number[] = []
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)

  function addAtom(symbol: string, nextIsH: boolean): string | null {
    const i = el.length
    let p = -1
    if (i > 0) {
      if (anchor >= 0) p = anchor
      else {
        for (let j = i - 1; j >= 0; j--) if (degree[j] < VALENCE[el[j]]) { p = j; break }
        // "COOH": the second O belongs to the carbon (carboxyl), not to the first O.
        if (p >= 0 && symbol === 'O' && el[p] === 'O' && nextIsH && parent[p] >= 0 && el[parent[p]] === 'C' &&
            degree[parent[p]] < VALENCE.C) p = parent[p]
      }
      if (p < 0) return `No free bond to attach ${symbol}.`
      if (degree[p] >= VALENCE[el[p]]) return `${el[p]} has no free bond for ${symbol}.`
    }
    anchor = -1
    el.push(symbol); parent.push(p); degree.push(0); fixedH.push(0)
    if (p >= 0) { order.set(key(p, i), 1); degree[p]++; degree[i]++ }
    if (pendingH) { intendedH.push([i, pendingH]); pendingH = 0 }
    last = i
    return null
  }

  for (let ti = 0; ti < tokens.length; ti++) {
    const tk = tokens[ti]
    if (tk.t === '(') { stack.push(last); anchor = last; continue }
    if (tk.t === ')') {
      const p = stack.pop()
      if (p === undefined) return { error: 'Unmatched ")".' }
      anchor = p; last = p; continue
    }
    if (tk.t === 'ph') {
      const i = el.length
      let p = -1
      if (i > 0) {
        if (anchor >= 0) p = anchor
        else for (let j = i - 1; j >= 0; j--) if (degree[j] < VALENCE[el[j]]) { p = j; break }
        if (p < 0 || degree[p] >= VALENCE[el[p]]) return { error: 'No free bond to attach the benzene ring.' }
      }
      anchor = -1
      for (let k = 0; k < 6; k++) {
        el.push('C'); parent.push(k === 0 ? p : -2); degree.push(4); fixedH.push(k === 0 ? 0 : 1)
        if (k > 0) order.set(key(i + k - 1, i + k), k % 2 === 1 ? 2 : 1)
      }
      order.set(key(i, i + 5), 1)
      if (p >= 0) { order.set(key(p, i), 1); degree[p]++ }
      degree[i] = p >= 0 ? 4 : 3 // a root ring keeps one free bond for what follows
      ringStart.set(i, i)
      if (pendingH) { intendedH.push([i, pendingH]); pendingH = 0 }
      last = i
      continue
    }
    if (tk.s === 'H') {
      totalH += tk.n
      if (last >= 0) intendedH.push([last, tk.n]); else pendingH += tk.n
      continue
    }
    const nextIsH = tokens[ti + 1]?.t === 'el' && (tokens[ti + 1] as { s: string }).s === 'H'
    let groupParent = -2
    for (let n = 0; n < tk.n; n++) {
      // Small-valence atoms in a group (CO2's O2) share one parent.
      if (n > 0 && VALENCE[tk.s] <= 2 && groupParent >= 0) anchor = groupParent
      const err = addAtom(tk.s, nextIsH && n === tk.n - 1)
      if (err) return { error: err }
      if (n === 0) groupParent = parent[el.length - 1]
    }
  }
  if (stack.length) return { error: 'Unmatched "(".' }

  if (!el.length) {
    if (totalH === 2) return hydrogenMolecule(cx, cy)
    return { error: 'Add at least one non-hydrogen atom (or H2).' }
  }

  const bondSum = (i: number) => {
    let s = 0
    for (const [k, o] of order) { const [a, b] = k.split('-').map(Number); if (a === i || b === i) s += o }
    return s
  }
  const free = el.map((e, i) => VALENCE[e] - bondSum(i) - fixedH[i])
  if (free.some(f => f < 0)) return { error: 'An atom has more bonds than its valence allows.' }

  // Turn spare valence into double/triple bonds (C2H4 -> C=C, CO2 -> O=C=O).
  const spare = free.reduce((a, b) => a + b, 0) - totalH
  if (spare < 0) return { error: `Too many H for this skeleton (${text}).` }
  for (let u = Math.floor(spare / 2); u > 0; u--) {
    let best: { k: string; a: number; b: number; score: number } | null = null
    for (const [k, o] of order) {
      const [a, b] = k.split('-').map(Number)
      if (o >= 3 || free[a] < 1 || free[b] < 1) continue
      const score = (el[a] !== 'C' || el[b] !== 'C' ? 100 : 0) + Math.min(free[a], free[b])
      if (!best || score > best.score) best = { k, a, b, score }
    }
    if (!best) break
    order.set(best.k, order.get(best.k)! + 1)
    free[best.a]--; free[best.b]--
  }

  // Place hydrogens: where the formula wrote them, spilling to atoms with room.
  const hOn: number[] = fixedH.slice()
  let remaining = totalH
  for (const [i, n] of intendedH) {
    const take = Math.min(n, free[i])
    hOn[i] += take; free[i] -= take; remaining -= take
  }
  while (remaining > 0) {
    let best = -1
    for (let i = 0; i < el.length; i++) if (free[i] > 0 && (best < 0 || free[i] > free[best])) best = i
    if (best < 0) return { error: `Too many H for this skeleton (${text}).` }
    hOn[best]++; free[best]--; remaining--
  }

  // Layout: tree from atom 0, children fanned out around their parent.
  const kids: number[][] = el.map(() => [])
  parent.forEach((p, i) => { if (p >= 0) kids[p].push(i) })
  const pos2: [number, number][] = el.map(() => [0, 0])
  const hPos: [number, number][] = []
  const hBond: [number, number][] = []
  const pt = (x: number, y: number, a: number, len: number): [number, number] =>
    [x + len * Math.cos(a), y - len * Math.sin(a)]

  function placeRing(i: number, dir: number) {
    const [x, y] = pos2[i]
    const [rx, ry] = pt(x, y, dir, BOND) // ring centre
    for (let k = 0; k < 6; k++) {
      const a = dir + Math.PI + (k * Math.PI) / 3
      pos2[i + k] = pt(rx, ry, a, BOND)
      if (k > 0) {
        hPos.push(pt(pos2[i + k][0], pos2[i + k][1], a, BOND))
        hBond.push([i + k, hPos.length - 1])
      }
    }
  }

  function place(i: number, dir: number | null, depth: number) {
    if (ringStart.has(i)) placeRing(i, dir ?? 0)
    const [x, y] = pos2[i]
    const n = kids[i].length + (ringStart.has(i) ? 0 : hOn[i])
    const dirs: number[] = []
    if (dir === null) {
      if (n === 2) dirs.push(Math.PI / 2 - 0.91, Math.PI / 2 + 0.91)
      else for (let k = 0; k < n; k++) dirs.push((ringStart.has(i) ? Math.PI : Math.PI / 2) - (k * 2 * Math.PI) / Math.max(n, 1))
    } else if (n === 1) {
      dirs.push(dir + (depth % 2 ? 1 : -1) * (Math.PI / 3))
    } else {
      const step = (2 * Math.PI) / (n + 1)
      for (let k = 0; k < n; k++) dirs.push(dir + (k - (n - 1) / 2) * step)
    }
    let d = 0
    for (const c of kids[i]) {
      const a = dirs[d++]
      pos2[c] = pt(x, y, a, BOND)
      place(c, a, depth + 1)
    }
    if (ringStart.has(i)) return
    for (let h = 0; h < hOn[i]; h++) {
      const a = dirs[d++]
      hPos.push(pt(x, y, a, BOND))
      hBond.push([i, hPos.length - 1])
    }
  }
  place(0, null, 0)

  // Centre the drawing on (cx, cy).
  const all = [...pos2, ...hPos]
  const mx = (Math.min(...all.map(p => p[0])) + Math.max(...all.map(p => p[0]))) / 2
  const my = (Math.min(...all.map(p => p[1])) + Math.max(...all.map(p => p[1]))) / 2
  const at = (p: [number, number]) => ({ x: cx + p[0] - mx, y: cy - (p[1] - my) })

  const heavy: Atom[] = el.map((e, i) => ({ id: makePointId(), element: e, ...at(pos2[i]) }))
  const hs: Atom[] = hPos.map(p => ({ id: makePointId(), element: 'H', ...at(p) }))
  const bonds: Bond[] = []
  for (const [k, o] of order) {
    const [a, b] = k.split('-').map(Number)
    bonds.push({ a: heavy[a].id, b: heavy[b].id, order: o as 1 | 2 | 3 })
  }
  for (const [i, h] of hBond) bonds.push({ a: heavy[i].id, b: hs[h].id, order: 1 })
  return { atoms: [...heavy, ...hs], bonds }
}

function hydrogenMolecule(cx: number, cy: number): Result {
  const a: Atom = { id: makePointId(), element: 'H', x: cx - 1, y: cy }
  const b: Atom = { id: makePointId(), element: 'H', x: cx + 1, y: cy }
  return { atoms: [a, b], bonds: [{ a: a.id, b: b.id, order: 1 }] }
}

function benzene(cx: number, cy: number): Result {
  const atoms: Atom[] = []
  for (let i = 0; i < 6; i++) {
    const t = -Math.PI / 2 + (i * Math.PI) / 3
    atoms.push({ id: makePointId(), element: 'C', x: cx + 2 * Math.cos(t), y: cy + 2 * Math.sin(t) })
  }
  const bonds: Bond[] = atoms.map((a, i) => ({
    a: a.id, b: atoms[(i + 1) % 6].id, order: (i % 2 === 0 ? 2 : 1) as 1 | 2,
  }))
  return { atoms, bonds }
}
