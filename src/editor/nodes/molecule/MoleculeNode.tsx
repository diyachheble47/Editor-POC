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
import { useMemo, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { RANGE, SIZE, toPx, toData, snap, makePointId } from '../_shared/plane'
import type { PlanePoint } from '../_shared/plane'

export type Atom = PlanePoint & { element: string }
export interface Bond { a: string; b: string; order: 1 | 2 | 3 }

export type SerializedMoleculeNode = Spread<
  { atoms: Atom[]; bonds: Bond[] },
  SerializedLexicalNode
>

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

function benzeneAtoms(): { atoms: Atom[]; bonds: Bond[] } {
  // Exact hexagon vertices, not snapped to the 0.5-unit placement grid —
  // snapping each vertex independently (as manual atom placement does)
  // distorts a regular hexagon into a lopsided one, since the x/y of a
  // 60°-spaced vertex is rarely itself a multiple of 0.5.
  const r = 2
  const atoms: Atom[] = []
  for (let i = 0; i < 6; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 3
    atoms.push({ id: makePointId(), x: r * Math.cos(angle), y: r * Math.sin(angle), element: 'C' })
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
}: {
  nodeKey: NodeKey
  atoms: Atom[]
  bonds: Bond[]
}) {
  const [editor] = useLexicalComposerContext()
  const [mode, setMode] = useState<Mode>('atom')
  const [activeElement, setActiveElement] = useState<string>('C')
  const [selected, setSelected] = useState<string | null>(null)

  function update(fn: (node: MoleculeNode) => void) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof MoleculeNode) fn(node)
    })
  }

  function handleBackgroundClick(e: React.MouseEvent<SVGSVGElement>) {
    if (mode !== 'atom' || activeElement === '⌫') return
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * SIZE
    const py = ((e.clientY - rect.top) / rect.height) * SIZE
    const [dx, dy] = toData(px, py)
    const x = snap(dx)
    const y = snap(dy)
    if (Math.abs(x) > RANGE || Math.abs(y) > RANGE) return
    update((node) => node.addAtom({ id: makePointId(), x, y, element: activeElement }))
  }

  function handleAtomClick(e: React.MouseEvent, id: string) {
    e.stopPropagation()
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
    const { atoms: ringAtoms, bonds: ringBonds } = benzeneAtoms()
    update((node) => node.addRing(ringAtoms, ringBonds))
  }

  const atomById = useMemo(() => new Map(atoms.map((a) => [a.id, a])), [atoms])

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
    <div className="geo-block" contentEditable={false}>
      <div className="graph-toolbar">
        <button type="button" className={`graph-mode-btn${mode === 'atom' ? ' active' : ''}`} onClick={() => { setMode('atom'); setSelected(null) }}>Atom</button>
        <button type="button" className={`graph-mode-btn${mode === 'bond' ? ' active' : ''}`} onClick={() => { setMode('bond'); setSelected(null) }}>Bond</button>
        <button type="button" className="graph-mode-btn geo-finish-btn" onClick={insertBenzene}>⬡ Benzene</button>
      </div>

      {mode === 'atom' && (
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
          <span className="graph-toolbar-hint">
            {activeElement === '⌫' ? 'Click an atom to erase it.' : `Click the grid to place ${activeElement}, click an atom to relabel it.`}
          </span>
        </div>
      )}
      {mode === 'bond' && (
        <div className="graph-toolbar-hint mol-bond-hint">
          Click two atoms to bond them; click the same pair again to cycle single → double → triple → none.
        </div>
      )}

      <svg className="mol-svg" viewBox={`0 0 ${SIZE} ${SIZE}`} onClick={handleBackgroundClick}>
        {renderedBonds.map((b) => (
          <g key={b.key}>
            {b.lines.map((ln, j) => (
              <line key={j} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} className="mol-bond" />
            ))}
          </g>
        ))}

        {atoms.map((a) => {
          const [px, py] = toPx(a.x, a.y)
          const labeled = a.element !== 'C'
          return (
            <g key={a.id} onClick={(e) => handleAtomClick(e, a.id)}>
              <circle cx={px} cy={py} r={labeled ? 9 : 6} className={`mol-atom-hit${selected === a.id ? ' selected' : ''}`} />
              {labeled && (
                <>
                  <rect x={px - 7} y={py - 8} width={14} height={14} className="mol-atom-backdrop" />
                  <text x={px} y={py + 4} textAnchor="middle" className="mol-atom-label" style={{ fill: elementColor(a.element) }}>
                    {a.element}
                  </text>
                </>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export class MoleculeNode extends DecoratorNode<React.ReactElement> {
  __atoms: Atom[]
  __bonds: Bond[]

  static getType(): string {
    return 'molecule'
  }

  static clone(node: MoleculeNode): MoleculeNode {
    return new MoleculeNode(node.__atoms, node.__bonds, node.__key)
  }

  constructor(atoms: Atom[] = [], bonds: Bond[] = [], key?: NodeKey) {
    super(key)
    this.__atoms = atoms
    this.__bonds = bonds
  }

  exportJSON(): SerializedMoleculeNode {
    return { type: 'molecule', version: 1, atoms: this.__atoms, bonds: this.__bonds }
  }

  static importJSON(s: SerializedMoleculeNode): MoleculeNode {
    return new MoleculeNode(s.atoms, s.bonds)
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
    return <MoleculeComponent nodeKey={this.getKey()} atoms={this.__atoms} bonds={this.__bonds} />
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
