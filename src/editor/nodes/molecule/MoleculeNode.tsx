// MoleculeNode — a skeletal-formula organic chemistry sketcher: place
// carbon/heteroatoms, draw single/double/triple bonds, and drop in a
// ready-made benzene ring. Same DecoratorNode + plain-SVG pattern as
// Graph/Geometry (zero bundle cost), sharing their grid/coordinate math
// from ../_shared/plane.
//
// Skeletal-formula convention: an unlabeled vertex is an implicit carbon
// (real structure drawings never write "C" at every bend) — only
// heteroatoms (N, O, S, explicit H, etc.) get a visible, colored label.

import { DecoratorNode, $getNodeByKey } from 'lexical'
import type {
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_HIGH, KEY_BACKSPACE_COMMAND, KEY_DELETE_COMMAND } from 'lexical'
import { moleculeFromFormula } from './formulaMolecule'
import { atomsFromSmiles } from './smilesLayout'
import { SIZE, SCALE, toPx, toData, snap, makePointId } from '../_shared/plane'
import type { PlanePoint } from '../_shared/plane'

export type Atom = PlanePoint & { element: string; h?: number } // h: implicit hydrogens shown in the label (OH, NH2)
export interface Bond { a: string; b: string; order: 1 | 2 | 3 }

export type SerializedMoleculeNode = Spread<
  { atoms: Atom[]; bonds: Bond[]; size?: number; smiles?: string },
  SerializedLexicalNode
>

const DEFAULT_SIZE = 560
const OLD_DEFAULT_SIZE = 300 // blocks saved before the bigger canvas
const MIN_SIZE = 200
const MAX_SIZE = 1000

type Mode = 'atom' | 'bond'
const PALETTE = ['H', 'C', 'N', 'O', 'S', '⌫'] as const

const ELEMENT_COLOR: Record<string, string> = {
  H: 'var(--c-text-3)',
  C: 'var(--c-text)',
  N: '#2563eb',
  O: '#dc2626',
  S: '#ca8a04',
}

function elementColor(el: string): string {
  return ELEMENT_COLOR[el] ?? 'var(--c-text)'
}

// Free spot for a new ring: first slot on a coarse grid whose centre is at
// least 2.5 units from every existing atom (so rings never stack on top of
// each other). Null when the canvas is full.
function freeRingCenter(existing: Atom[]): [number, number] | null {
  // Rings are 2 units in radius; keep every atom 5 from the new centre, i.e. a
  // clear gap of 3 units between rings, so they never touch.
  const slots = [0, 7, -7, 14, -14]
  for (const cy of slots) {
    for (const cx of slots) {
      if (existing.every((a) => Math.hypot(a.x - cx, a.y - cy) >= 5)) return [cx, cy]
    }
  }
  return null
}

function benzeneAtoms(cx = 0, cy = 0): { atoms: Atom[]; bonds: Bond[] } {
  // Exact hexagon vertices, not snapped to the 0.5-unit placement grid —
  // snapping each vertex independently (as manual atom placement does)
  // distorts a regular hexagon into a lopsided one, since the x/y of a
  // 60°-spaced vertex is rarely itself a multiple of 0.5.
  const r = 2
  const atoms: Atom[] = []
  for (let i = 0; i < 6; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 3
    atoms.push({ id: makePointId(), x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), element: 'C' })
  }
  const bonds: Bond[] = atoms.map((a, i) => ({
    a: a.id,
    b: atoms[(i + 1) % atoms.length].id,
    order: (i % 2 === 0 ? 2 : 1) as 1 | 2,
  }))
  return { atoms, bonds }
}

function MoleculeComponent({
  nodeKey,
  atoms,
  bonds,
  size,
  smiles,
}: {
  nodeKey: NodeKey
  atoms: Atom[]
  bonds: Bond[]
  size: number
  smiles?: string
}) {
  const [editor] = useLexicalComposerContext()
  const [mode, setMode] = useState<Mode>('atom')
  const [activeElement, setActiveElement] = useState<string>('C')
  const [selected, setSelected] = useState<string | null>(null)
  // Tools/grid only show while editing; a fresh empty block starts in edit mode.
  const [editing, setEditing] = useState(atoms.length === 0)
  const [liveSize, setLiveSize] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // A molecule the AI described as SMILES arrives without coordinates: lay it
  // out once (library loaded on demand) and store the result on the node.
  useEffect(() => {
    if (!smiles || atoms.length) return
    let cancelled = false
    void atomsFromSmiles(smiles).then((res) => {
      if (cancelled || 'error' in res) return
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node instanceof MoleculeNode) node.setStructure(res.atoms, res.bonds)
      }, { tag: 'tnb-trailing' }) // not a user edit
    })
    return () => { cancelled = true }
  }, [smiles, atoms.length, editor, nodeKey])
  const shownSize = liveSize ?? size
  // The visible area starts as the plane's SIZE square and grows to include any
  // atom outside it (a ring dropped near an edge, an AI-built molecule), so
  // nothing is clipped at the sides.
  const base = useMemo(() => {
    const PAD = 24
    let x0 = 0, y0 = 0, x1 = SIZE, y1 = SIZE
    for (const a of atoms) {
      const [px, py] = toPx(a.x, a.y)
      x0 = Math.min(x0, px - PAD); y0 = Math.min(y0, py - PAD)
      x1 = Math.max(x1, px + PAD); y1 = Math.max(y1, py + PAD)
    }
    return { x: x0, y: y0, side: Math.max(x1 - x0, y1 - y0) }
  }, [atoms])
  const baseRef = useRef(base)
  baseRef.current = base
  // Zoom/pan are view-only (not saved): viewBox = [base + (vx, vy), base.side/zoom square].
  const [view, setView] = useState({ zoom: 1, vx: 0, vy: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const dragMoved = useRef(false)

  // Wheel zoom around the cursor. Needs a non-passive native listener so the
  // page doesn't scroll at the same time.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !editing) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const rect = svg!.getBoundingClientRect()
      const fx = (e.clientX - rect.left) / rect.width
      const fy = (e.clientY - rect.top) / rect.height
      setView((v) => {
        const zoom = Math.max(0.5, Math.min(6, v.zoom * Math.exp(-e.deltaY * 0.0015)))
        const side = baseRef.current.side
        const oldW = side / v.zoom, newW = side / zoom
        return { zoom, vx: v.vx + (oldW - newW) * fx, vy: v.vy + (oldW - newW) * fy }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [editing])

  // Zoom and pan belong to edit mode; leaving it shows the whole molecule again.
  useEffect(() => { if (!editing) setView({ zoom: 1, vx: 0, vy: 0 }) }, [editing])

  function startPan(e: React.PointerEvent<SVGSVGElement>) {
    dragMoved.current = false
    const rect = e.currentTarget.getBoundingClientRect()
    const startX = e.clientX, startY = e.clientY
    const start = view
    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX, dy = ev.clientY - startY
      if (!dragMoved.current && Math.hypot(dx, dy) < 4) return
      dragMoved.current = true
      const w = baseRef.current.side / start.zoom
      setView({ ...start, vx: start.vx - (dx / rect.width) * w, vy: start.vy - (dy / rect.height) * w })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  useEffect(() => {
    if (!editing) return
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setEditing(false)
        setSelected(null)
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [editing])

  const atomsRef = useRef(atoms)
  atomsRef.current = atoms
  const lastTouched = useRef<string | null>(null)

  // While editing, Backspace/Delete removes an atom instead of falling through
  // to Lexical, which would delete the whole block.
  useEffect(() => {
    if (!editing) return
    function onKey(): boolean {
      const list = atomsRef.current
      const target = list.find((a) => a.id === lastTouched.current) ?? list[list.length - 1]
      lastTouched.current = null
      if (target) update((node) => node.removeAtom(target.id))
      return true
    }
    const offs = [
      editor.registerCommand(KEY_BACKSPACE_COMMAND, onKey, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_DELETE_COMMAND, onKey, COMMAND_PRIORITY_HIGH),
    ]
    return () => offs.forEach((off) => off())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, editor, nodeKey])

  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startSize = shownSize
    let latest = startSize
    function onMove(ev: PointerEvent) {
      latest = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(startSize + ev.clientX - startX)))
      setLiveSize(latest)
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      update((node) => node.setSize(latest))
      setLiveSize(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function update(fn: (node: MoleculeNode) => void) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof MoleculeNode) fn(node)
    })
  }

  function handleBackgroundClick(e: React.MouseEvent<SVGSVGElement>) {
    if (dragMoved.current) { dragMoved.current = false; return }
    if (!editing || mode !== 'atom' || activeElement === '⌫') return
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const w = base.side / view.zoom
    const px = base.x + view.vx + ((e.clientX - rect.left) / rect.width) * w
    const py = base.y + view.vy + ((e.clientY - rect.top) / rect.height) * w
    const [dx, dy] = toData(px, py)
    const x = snap(dx)
    const y = snap(dy)
    const id = makePointId()
    lastTouched.current = id
    update((node) => node.addAtom({ id, x, y, element: activeElement }))
  }

  // Dragging an atom moves everything bonded to it (so a whole ring or
  // molecule moves together). The move is previewed in local state and written
  // to the document once, on release.
  const [drag, setDrag] = useState<{ ids: Set<string>; dx: number; dy: number } | null>(null)

  // Bond mode: drag from an atom to another atom to bond them, or to empty
  // space to grow a new atom (the selected element) on a bond.
  const [bondDrag, setBondDrag] = useState<{ from: string; x: number; y: number } | null>(null)

  function startBondDrag(e: React.PointerEvent, id: string, rect: DOMRect) {
    dragMoved.current = false
    const startX = e.clientX, startY = e.clientY
    const toSvg = (ev: PointerEvent): [number, number] => {
      const w = baseRef.current.side / view.zoom
      return [
        baseRef.current.x + view.vx + ((ev.clientX - rect.left) / rect.width) * w,
        baseRef.current.y + view.vy + ((ev.clientY - rect.top) / rect.height) * w,
      ]
    }
    function onMove(ev: PointerEvent) {
      if (!dragMoved.current && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return
      dragMoved.current = true
      const [x, y] = toSvg(ev)
      setBondDrag({ from: id, x, y })
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setBondDrag(null)
      if (!dragMoved.current) return
      const [x, y] = toSvg(ev)
      const hit = atomsRef.current.find((a) => {
        const [ax, ay] = toPx(a.x, a.y)
        return a.id !== id && Math.hypot(ax - x, ay - y) <= 16
      })
      if (hit) { update((node) => node.cycleBond(id, hit.id)); return }
      const [dx, dy] = toData(x, y)
      const atom = { id: makePointId(), x: snap(dx), y: snap(dy), element: activeElement === '⌫' ? 'C' : activeElement }
      lastTouched.current = atom.id
      update((node) => { node.addAtom(atom); node.cycleBond(id, atom.id) })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function startAtomDrag(e: React.PointerEvent, id: string) {
    e.stopPropagation() // don't pan the canvas
    if (!editing) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (mode === 'bond') { startBondDrag(e, id, rect); return }
    dragMoved.current = false
    // Connected component of `id` through bonds.
    const ids = new Set([id])
    for (let grew = true; grew;) {
      grew = false
      for (const b of bonds) {
        if (ids.has(b.a) !== ids.has(b.b)) { ids.add(b.a); ids.add(b.b); grew = true }
      }
    }
    const startX = e.clientX, startY = e.clientY
    let last = { dx: 0, dy: 0 }
    function onMove(ev: PointerEvent) {
      const cx = ev.clientX - startX, cy = ev.clientY - startY
      if (!dragMoved.current && Math.hypot(cx, cy) < 4) return
      dragMoved.current = true
      const w = baseRef.current.side / view.zoom
      last = { dx: ((cx / rect.width) * w) / SCALE, dy: -((cy / rect.height) * w) / SCALE }
      setDrag({ ids, ...last })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (dragMoved.current) update((node) => node.moveAtoms([...ids], last.dx, last.dy))
      setDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function handleAtomClick(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (dragMoved.current) { dragMoved.current = false; return }
    if (!editing) { setEditing(true); return }
    lastTouched.current = id
    if (mode === 'atom') {
      if (activeElement === '⌫') update((node) => node.removeAtom(id))
      else update((node) => node.setElement(id, activeElement))
      return
    }
    // Bond mode: first click selects, second click cycles the bond order.
    if (selected === null) setSelected(id)
    else if (selected === id) setSelected(null)
    else { update((node) => node.cycleBond(selected, id)); setSelected(null) }
  }

  function insertBenzene() {
    const center = freeRingCenter(atoms)
    if (!center) return
    const { atoms: ringAtoms, bonds: ringBonds } = benzeneAtoms(center[0], center[1])
    update((node) => node.addRing(ringAtoms, ringBonds))
  }

  // Atoms as drawn: the dragged group is shifted by the live drag offset.
  const shown = useMemo(
    () => (drag ? atoms.map((a) => (drag.ids.has(a.id) ? { ...a, x: a.x + drag.dx, y: a.y + drag.dy } : a)) : atoms),
    [atoms, drag],
  )
  const [formula, setFormula] = useState('')
  const [formulaError, setFormulaError] = useState<string | null>(null)
  const [inputKind, setInputKind] = useState<'formula' | 'smiles'>('formula')
  async function buildFormula() {
    const center = freeRingCenter(atoms) ?? [0, 0]
    let res
    if (inputKind === 'smiles') {
      res = await atomsFromSmiles(formula)
      if (!('error' in res)) { // move the layout (centred on 0,0) to the free spot
        res = { ...res, atoms: res.atoms.map(a => ({ ...a, x: a.x + center[0], y: a.y + center[1] })) }
      }
    } else res = moleculeFromFormula(formula, center[0], center[1])
    if ('error' in res) { setFormulaError(res.error); return }
    setFormulaError(null)
    setFormula('')
    update((node) => node.addRing(res.atoms, res.bonds))
  }

  const atomById = useMemo(() => new Map(shown.map((a) => [a.id, a])), [shown])

  const renderedBonds = useMemo(() => {
    return bonds.map((bond, i) => {
      const a = atomById.get(bond.a)
      const b = atomById.get(bond.b)
      if (!a || !b) return null
      const [x1, y1] = toPx(a.x, a.y)
      const [x2, y2] = toPx(b.x, b.y)
      const dx = x2 - x1, dy = y2 - y1
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len, uy = dy / len
      const px_ = -uy, py_ = ux
      const gap = 3.5
      const inset = len * 0.18 // shorten the extra double/triple-bond lines so they
      // sit inside the vertex-to-vertex backbone line instead of poking past the
      // corners where two bonds meet (the cause of benzene's spiky look).
      // Each extra line is {offset from center, inset at both ends}; the main
      // backbone line (offset 0) always runs the full atom-to-atom length.
      const extra = bond.order === 2 ? [gap * 2] : bond.order === 3 ? [gap * 2, -gap * 2] : []
      const segments: { offset: number; inset: number }[] = [
        { offset: 0, inset: 0 },
        ...extra.map((offset) => ({ offset, inset })),
      ]
      return {
        key: i,
        lines: segments.map((s) => ({
          x1: x1 + px_ * s.offset + ux * s.inset,
          y1: y1 + py_ * s.offset + uy * s.inset,
          x2: x2 + px_ * s.offset - ux * s.inset,
          y2: y2 + py_ * s.offset - uy * s.inset,
        })),
      }
    }).filter((b): b is NonNullable<typeof b> => b !== null)
  }, [bonds, atomById])

  return (
    <div
      ref={rootRef}
      className={`geo-block mol-block${editing ? ' mol-editing' : ''}`}
      contentEditable={false}
      onClick={() => { if (!editing) setEditing(true) }}
    >
      {editing && (<>
      <div className="graph-toolbar">
        <button type="button" className={`graph-mode-btn${mode === 'atom' ? ' active' : ''}`} onClick={() => { setMode('atom'); setSelected(null) }}>Atom</button>
        <button type="button" className={`graph-mode-btn${mode === 'bond' ? ' active' : ''}`} onClick={() => { setMode('bond'); setSelected(null) }}>Bond</button>
        <button type="button" className="graph-mode-btn geo-finish-btn" onClick={insertBenzene}>⬡ Benzene</button>
        <button type="button" className="graph-mode-btn" onClick={() => update((node) => node.clear())}>Clear</button>
        <select
          className="mol-formula-kind"
          value={inputKind}
          onChange={e => { setInputKind(e.target.value as 'formula' | 'smiles'); setFormulaError(null) }}
          aria-label="Input type"
        >
          <option value="formula">Formula</option>
          <option value="smiles">SMILES</option>
        </select>
        <input
          className="mol-formula-input"
          placeholder={inputKind === 'smiles' ? 'SMILES: CC(=O)O, c1ccccc1O' : 'Formula: H2O, CH3COOH'}
          value={formula}
          onChange={e => { setFormula(e.target.value); setFormulaError(null) }}
          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') buildFormula() }}
          aria-label="Molecular formula"
        />
        <button type="button" className="graph-mode-btn" onClick={buildFormula}>Build</button>
        {formulaError && <span className="mol-formula-error" role="alert">{formulaError}</span>}
      </div>

      {(
        <div className="mol-palette">
          {PALETTE.map((el) => (
            <button
              key={el}
              type="button"
              className={`mol-palette-btn${activeElement === el ? ' active' : ''}`}
              style={el !== '⌫' ? { color: elementColor(el) } : undefined}
              onClick={() => setActiveElement(el)}
            >
              {el}
            </button>
          ))}
          {mode === 'atom' && <span className="graph-toolbar-hint">
            {activeElement === '⌫' ? 'Click an atom to erase it.' : `Click the grid to place ${activeElement}, click an atom to relabel it, drag an atom to move it (with everything bonded to it).`}
          </span>}
        </div>
      )}
      {mode === 'bond' && (
        <div className="graph-toolbar-hint mol-bond-hint">
          Drag from an atom to another atom to bond them, or to empty space to add a new atom (element picked in Atom mode). Or click two atoms; click the same pair again to cycle single → double → triple → none.
        </div>
      )}
      </>)}

      <div className="mol-canvas" style={{ width: shownSize }}>
      <svg
        ref={svgRef}
        className="mol-svg"
        viewBox={`${base.x + view.vx} ${base.y + view.vy} ${base.side / view.zoom} ${base.side / view.zoom}`}
        onClick={handleBackgroundClick}
        onPointerDown={editing ? startPan : undefined}
        onDoubleClick={editing ? () => setView({ zoom: 1, vx: 0, vy: 0 }) : undefined}
      >
        {renderedBonds.map((b) => (
          <g key={b.key}>
            {b.lines.map((ln, j) => (
              <line key={j} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} className="mol-bond" />
            ))}
          </g>
        ))}

        {bondDrag && atomById.get(bondDrag.from) && (() => {
          const [fx, fy] = toPx(atomById.get(bondDrag.from)!.x, atomById.get(bondDrag.from)!.y)
          return <line x1={fx} y1={fy} x2={bondDrag.x} y2={bondDrag.y} className="mol-bond" strokeDasharray="5 4" />
        })()}

        {shown.map((a) => {
          const [px, py] = toPx(a.x, a.y)
          const label = a.element + (a.h ? 'H' + (a.h > 1 ? a.h : '') : '')
          const labeled = a.element !== 'C' || !!a.h
          const boxW = label.length * 8 + 6
          return (
            <g key={a.id} onClick={(e) => handleAtomClick(e, a.id)} onPointerDown={(e) => startAtomDrag(e, a.id)}>
              <circle cx={px} cy={py} r={labeled ? 12 : 10} className={`mol-atom-hit${selected === a.id ? ' selected' : ''}`} />
              {labeled && (
                <>
                  <rect x={px - boxW / 2} y={py - 8} width={boxW} height={14} className="mol-atom-backdrop" />
                  <text x={px} y={py + 4} textAnchor="middle" className="mol-atom-label" style={{ fill: elementColor(a.element) }}>
                    {label}
                  </text>
                </>
              )}
            </g>
          )
        })}
      </svg>
      {editing && <div className="mol-resize-handle" title="Drag to resize" onPointerDown={startResize} />}
      </div>
    </div>
  )
}

export class MoleculeNode extends DecoratorNode<React.ReactElement> {
  __atoms: Atom[]
  __bonds: Bond[]
  __size: number
  __smiles: string

  static getType(): string {
    return 'molecule'
  }

  static clone(node: MoleculeNode): MoleculeNode {
    return new MoleculeNode(node.__atoms, node.__bonds, node.__size, node.__smiles, node.__key)
  }

  constructor(atoms: Atom[] = [], bonds: Bond[] = [], size: number = DEFAULT_SIZE, smiles = '', key?: NodeKey) {
    super(key)
    this.__atoms = atoms
    this.__bonds = bonds
    this.__size = size
    this.__smiles = smiles
  }

  exportJSON(): SerializedMoleculeNode {
    return { type: 'molecule', version: 1, atoms: this.__atoms, bonds: this.__bonds, size: this.__size, ...(this.__smiles ? { smiles: this.__smiles } : {}) }
  }

  static importJSON(s: SerializedMoleculeNode): MoleculeNode {
    return new MoleculeNode(
      s.atoms, s.bonds,
      !s.size || s.size === OLD_DEFAULT_SIZE ? DEFAULT_SIZE : s.size,
      s.smiles ?? '',
    )
  }

  clear(): void {
    const self = this.getWritable()
    self.__atoms = []
    self.__bonds = []
  }

  /** Fills in a molecule that was created from SMILES; the SMILES is no longer needed. */
  setStructure(atoms: Atom[], bonds: Bond[]): void {
    const self = this.getWritable()
    self.__atoms = atoms
    self.__bonds = bonds
    self.__smiles = ''
  }

  setSize(size: number): void {
    this.getWritable().__size = size
  }

  addAtom(atom: Atom): void {
    const self = this.getWritable()
    self.__atoms = [...self.__atoms, atom]
  }

  removeAtom(id: string): void {
    const self = this.getWritable()
    self.__atoms = self.__atoms.filter((a) => a.id !== id)
    self.__bonds = self.__bonds.filter((b) => b.a !== id && b.b !== id)
  }

  setElement(id: string, element: string): void {
    const self = this.getWritable()
    self.__atoms = self.__atoms.map((a) => (a.id === id ? { ...a, element } : a))
  }

  cycleBond(a: string, b: string): void {
    const self = this.getWritable()
    const idx = self.__bonds.findIndex((bond) => (bond.a === a && bond.b === b) || (bond.a === b && bond.b === a))
    if (idx === -1) {
      self.__bonds = [...self.__bonds, { a, b, order: 1 }]
      return
    }
    const current = self.__bonds[idx]
    if (current.order === 3) {
      self.__bonds = self.__bonds.filter((_, i) => i !== idx)
    } else {
      self.__bonds = self.__bonds.map((bond, i) => (i === idx ? { ...bond, order: (bond.order + 1) as 1 | 2 | 3 } : bond))
    }
  }

  /** Moves atoms by (dx, dy) data units (no snapping, so rings stay regular). */
  moveAtoms(ids: string[], dx: number, dy: number): void {
    const set = new Set(ids)
    const self = this.getWritable()
    self.__atoms = self.__atoms.map((a) => (set.has(a.id) ? { ...a, x: a.x + dx, y: a.y + dy } : a))
  }

  addRing(ringAtoms: Atom[], ringBonds: Bond[]): void {
    const self = this.getWritable()
    self.__atoms = [...self.__atoms, ...ringAtoms]
    self.__bonds = [...self.__bonds, ...ringBonds]
  }

  // Block-level: the default (true) makes Lexical wrap this in a paragraph.
  isInline(): boolean {
    return false
  }

  createDOM(_config: EditorConfig): HTMLElement {
    return document.createElement('div')
  }

  updateDOM(): boolean {
    return false
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement {
    return <MoleculeComponent nodeKey={this.getKey()} atoms={this.__atoms} bonds={this.__bonds} size={this.__size} smiles={this.__smiles} />
  }
}

export function $createMoleculeNode(): MoleculeNode {
  return new MoleculeNode()
}

export function $isMoleculeNode(
  node: LexicalNode | null | undefined,
): node is MoleculeNode {
  return node instanceof MoleculeNode
}
