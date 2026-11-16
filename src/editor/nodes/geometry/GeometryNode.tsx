// GeometryNode — a coordinate plane for classic geometry constructions:
// points, segments, infinite lines, rays, angles (with their degree
// measure), and filled polygons.
//
// Shares its grid/axis/point math with the Graph block (../_shared/plane)
// but is otherwise a separate DecoratorNode: Graph is about functions and
// numeric plotting, this is about shapes — different enough data (edge
// "kind", angles, polygons) and rendering (infinite-line clipping, arcs)
// that merging them would make both harder to follow for no real gain.

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
import { RANGE, SIZE, toPx, toData, snap, makePointId, gridLines, clipLineToBounds } from '../_shared/plane'
import type { PlanePoint } from '../_shared/plane'

export type GeoPoint = PlanePoint
export type EdgeKind = 'segment' | 'line' | 'ray'
export interface GeoEdge { a: string; b: string; kind: EdgeKind }
export interface GeoAngle { p1: string; vertex: string; p2: string }
export type GeoPolygon = string[]

export type SerializedGeometryNode = Spread<
  { points: GeoPoint[]; edges: GeoEdge[]; angles: GeoAngle[]; polygons: GeoPolygon[] },
  SerializedLexicalNode
>

type Mode = 'point' | 'segment' | 'line' | 'ray' | 'angle' | 'polygon'

const MODE_LABEL: Record<Mode, string> = {
  point: 'Point',
  segment: 'Segment',
  line: 'Line',
  ray: 'Ray',
  angle: 'Angle',
  polygon: 'Polygon',
}

const MODE_HINT: Record<Mode, string> = {
  point: 'Click the grid to add a point, click a point to remove it.',
  segment: 'Click two points to draw a segment between them.',
  line: 'Click two points to draw an infinite line through them.',
  ray: 'Click a start point, then a second point to aim the ray.',
  angle: 'Click the first arm, then the vertex, then the second arm.',
  polygon: 'Click points in order. Click the first point again, or press Finish, to close the shape.',
}

function GeometryComponent({
  nodeKey,
  points,
  edges,
  angles,
  polygons,
}: {
  nodeKey: NodeKey
  points: GeoPoint[]
  edges: GeoEdge[]
  angles: GeoAngle[]
  polygons: GeoPolygon[]
}) {
  const [editor] = useLexicalComposerContext()
  const [mode, setMode] = useState<Mode>('point')
  const [selected, setSelected] = useState<string | null>(null)
  const [angleChain, setAngleChain] = useState<string[]>([])
  const [polyChain, setPolyChain] = useState<string[]>([])

  function update(fn: (node: GeometryNode) => void) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof GeometryNode) fn(node)
    })
  }

  function setMode_(next: Mode) {
    setMode(next)
    setSelected(null)
    setAngleChain([])
    setPolyChain([])
  }

  function routeSelection(id: string) {
    if (mode === 'segment' || mode === 'line' || mode === 'ray') {
      if (selected === null) setSelected(id)
      else if (selected === id) setSelected(null)
      else { update((node) => node.toggleEdge(selected, id, mode)); setSelected(null) }
    } else if (mode === 'angle') {
      setAngleChain((prev) => {
        const next = [...prev, id]
        if (next.length === 3) {
          update((node) => node.addAngle(next[0], next[1], next[2]))
          return []
        }
        return next
      })
    } else if (mode === 'polygon') {
      setPolyChain((prev) => {
        // Clicking back on the first point closes the shape — the same
        // as pressing Finish. Without this, that click did nothing
        // (silently ignored as an already-selected point), which looked
        // like the last point just wasn't connecting.
        if (prev.length >= 3 && prev[0] === id) {
          update((node) => node.addPolygon(prev))
          return []
        }
        return prev.includes(id) ? prev : [...prev, id]
      })
    }
  }

  function handleBackgroundClick(e: React.MouseEvent<SVGSVGElement>) {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * SIZE
    const py = ((e.clientY - rect.top) / rect.height) * SIZE
    const [dx, dy] = toData(px, py)
    const x = snap(dx)
    const y = snap(dy)
    if (Math.abs(x) > RANGE || Math.abs(y) > RANGE) return

    if (mode === 'point') {
      update((node) => node.addPoint({ id: makePointId(), x, y }))
      return
    }
    const id = makePointId()
    update((node) => node.addPoint({ id, x, y }))
    routeSelection(id)
  }

  function handlePointClick(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (mode === 'point') {
      update((node) => node.removePoint(id))
      return
    }
    routeSelection(id)
  }

  function finishPolygon() {
    if (polyChain.length >= 3) update((node) => node.addPolygon(polyChain))
    setPolyChain([])
  }

  const grid = useMemo(() => gridLines(), [])
  const pointById = useMemo(() => new Map(points.map((p) => [p.id, p])), [points])

  const renderedEdges = useMemo(() => {
    return edges.map((edge, i) => {
      const pa = pointById.get(edge.a)
      const pb = pointById.get(edge.b)
      if (!pa || !pb) return null
      if (edge.kind === 'segment') {
        const [x1, y1] = toPx(pa.x, pa.y)
        const [x2, y2] = toPx(pb.x, pb.y)
        return { key: i, x1, y1, x2, y2, kind: edge.kind }
      }
      const dx = pb.x - pa.x
      const dy = pb.y - pa.y
      const clipped = clipLineToBounds(pa.x, pa.y, dx, dy, edge.kind === 'ray')
      if (!clipped) return null
      const [x1, y1] = toPx(clipped[0], clipped[1])
      const [x2, y2] = toPx(clipped[2], clipped[3])
      return { key: i, x1, y1, x2, y2, kind: edge.kind }
    }).filter((e): e is NonNullable<typeof e> => e !== null)
  }, [edges, pointById])

  const renderedAngles = useMemo(() => {
    const r = 28
    return angles.map((a, i) => {
      const v = pointById.get(a.vertex)
      const p1 = pointById.get(a.p1)
      const p2 = pointById.get(a.p2)
      if (!v || !p1 || !p2) return null
      const [vx, vy] = toPx(v.x, v.y)
      const [x1, y1] = toPx(p1.x, p1.y)
      const [x2, y2] = toPx(p2.x, p2.y)
      const a1 = Math.atan2(y1 - vy, x1 - vx)
      const a2 = Math.atan2(y2 - vy, x2 - vx)
      let diff = a2 - a1
      while (diff <= -Math.PI) diff += 2 * Math.PI
      while (diff > Math.PI) diff -= 2 * Math.PI
      const degrees = Math.round(Math.abs(diff) * (180 / Math.PI))
      const sweep = diff > 0 ? 1 : 0
      const ax1 = vx + r * Math.cos(a1)
      const ay1 = vy + r * Math.sin(a1)
      const ax2 = vx + r * Math.cos(a2)
      const ay2 = vy + r * Math.sin(a2)
      const mid = a1 + diff / 2
      const lx = vx + (r + 16) * Math.cos(mid)
      const ly = vy + (r + 16) * Math.sin(mid)
      return { key: i, path: `M ${ax1} ${ay1} A ${r} ${r} 0 0 ${sweep} ${ax2} ${ay2}`, lx, ly, degrees }
    }).filter((a): a is NonNullable<typeof a> => a !== null)
  }, [angles, pointById])

  const renderedPolygons = useMemo(() => {
    return polygons.map((ids, i) => {
      const pts = ids.map((id) => pointById.get(id)).filter((p): p is GeoPoint => !!p)
      if (pts.length < 3) return null
      return { key: i, points: pts.map((p) => toPx(p.x, p.y).join(',')).join(' ') }
    }).filter((p): p is NonNullable<typeof p> => p !== null)
  }, [polygons, pointById])

  const polyPreview = useMemo(() => {
    const pts = polyChain.map((id) => pointById.get(id)).filter((p): p is GeoPoint => !!p)
    return pts.map((p) => toPx(p.x, p.y).join(',')).join(' ')
  }, [polyChain, pointById])

  return (
    <div className="geo-block" contentEditable={false}>
      <div className="graph-toolbar">
        {(['point', 'segment', 'line', 'ray', 'angle', 'polygon'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={`graph-mode-btn${mode === m ? ' active' : ''}`}
            onClick={() => setMode_(m)}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
        {mode === 'polygon' && polyChain.length >= 3 && (
          <button type="button" className="graph-mode-btn geo-finish-btn" onClick={finishPolygon}>Finish</button>
        )}
        <span className="graph-toolbar-hint">{MODE_HINT[mode]}</span>
      </div>

      <svg className="graph-svg" viewBox={`0 0 ${SIZE} ${SIZE}`} onClick={handleBackgroundClick}>
        {grid.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={l.major ? 'graph-axis' : 'graph-gridline'} />
        ))}

        {renderedPolygons.map((p) => (
          <polygon key={p.key} points={p.points} className="geo-polygon" />
        ))}

        {polyChain.length > 0 && (
          <polyline points={polyPreview} className="geo-poly-preview" />
        )}

        {renderedEdges.map((e) => (
          <line key={e.key} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} className={`geo-edge geo-edge-${e.kind}`} />
        ))}

        {renderedAngles.map((a) => (
          <g key={a.key}>
            <path d={a.path} className="geo-angle-arc" />
            <text x={a.lx} y={a.ly} className="geo-angle-label" textAnchor="middle">{a.degrees}°</text>
          </g>
        ))}

        {points.map((p) => {
          const [px, py] = toPx(p.x, p.y)
          const isChainMember = angleChain.includes(p.id) || polyChain.includes(p.id)
          return (
            <g key={p.id} onClick={(e) => handlePointClick(e, p.id)}>
              <circle
                cx={px} cy={py} r={6}
                className={`graph-point${selected === p.id || isChainMember ? ' selected' : ''}`}
              />
              <text x={px + 9} y={py - 7} className="graph-point-label">({p.x}, {p.y})</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export class GeometryNode extends DecoratorNode<React.ReactElement> {
  __points: GeoPoint[]
  __edges: GeoEdge[]
  __angles: GeoAngle[]
  __polygons: GeoPolygon[]

  static getType(): string {
    return 'geometry'
  }

  static clone(node: GeometryNode): GeometryNode {
    return new GeometryNode(node.__points, node.__edges, node.__angles, node.__polygons, node.__key)
  }

  constructor(
    points: GeoPoint[] = [],
    edges: GeoEdge[] = [],
    angles: GeoAngle[] = [],
    polygons: GeoPolygon[] = [],
    key?: NodeKey,
  ) {
    super(key)
    this.__points = points
    this.__edges = edges
    this.__angles = angles
    this.__polygons = polygons
  }

  exportJSON(): SerializedGeometryNode {
    return {
      type: 'geometry',
      version: 1,
      points: this.__points,
      edges: this.__edges,
      angles: this.__angles,
      polygons: this.__polygons,
    }
  }

  static importJSON(s: SerializedGeometryNode): GeometryNode {
    return new GeometryNode(s.points, s.edges, s.angles, s.polygons)
  }

  addPoint(point: GeoPoint): void {
    const self = this.getWritable()
    self.__points = [...self.__points, point]
  }

  removePoint(id: string): void {
    const self = this.getWritable()
    self.__points = self.__points.filter((p) => p.id !== id)
    self.__edges = self.__edges.filter((e) => e.a !== id && e.b !== id)
    self.__angles = self.__angles.filter((a) => a.vertex !== id && a.p1 !== id && a.p2 !== id)
    self.__polygons = self.__polygons
      .map((poly) => poly.filter((pid) => pid !== id))
      .filter((poly) => poly.length >= 3)
  }

  toggleEdge(a: string, b: string, kind: EdgeKind): void {
    const self = this.getWritable()
    const exists = self.__edges.some((e) => e.kind === kind && ((e.a === a && e.b === b) || (e.a === b && e.b === a)))
    self.__edges = exists
      ? self.__edges.filter((e) => !(e.kind === kind && ((e.a === a && e.b === b) || (e.a === b && e.b === a))))
      : [...self.__edges, { a, b, kind }]
  }

  addAngle(p1: string, vertex: string, p2: string): void {
    const self = this.getWritable()
    self.__angles = [...self.__angles, { p1, vertex, p2 }]
  }

  addPolygon(ids: string[]): void {
    const self = this.getWritable()
    self.__polygons = [...self.__polygons, ids]
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
    return (
      <GeometryComponent
        nodeKey={this.getKey()}
        points={this.__points}
        edges={this.__edges}
        angles={this.__angles}
        polygons={this.__polygons}
      />
    )
  }
}

export function $createGeometryNode(): GeometryNode {
  return new GeometryNode()
}

export function $isGeometryNode(
  node: LexicalNode | null | undefined,
): node is GeometryNode {
  return node instanceof GeometryNode
}
