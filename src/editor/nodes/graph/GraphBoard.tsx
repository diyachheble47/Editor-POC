// The drawing surface of the graph block, built on JSXGraph (axes, grid,
// function plots, draggable points, zoom and pan). Loaded on demand so the
// library only downloads when a document has a graph. The block's data model
// (points / edges / functions) is unchanged; this only draws it and reports
// what the user does back to GraphNode.

import { useEffect, useRef } from 'react'
import { useTheme } from '../../../context/ThemeContext'
import JXG from 'jsxgraph'
import './jsxgraph.css' // copied from the jsxgraph package (its exports map hides the css file)
import { compileExpr } from './expr'
import { RANGE, snap } from '../_shared/plane'
import type { PlanePoint } from '../_shared/plane'

export interface GraphBoardProps {
  points: PlanePoint[]
  edges: [string, string][]
  functions: string[]
  colors: string[]
  editing: boolean
  selected: string | null
  onBackgroundClick: (x: number, y: number) => void
  onPointClick: (id: string) => void
  onPointMoved: (id: string, x: number, y: number) => void
  onEnterEdit: () => void
}

const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

export default function GraphBoard(props: GraphBoardProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = props
  // Zoom/pan survives the redraws that follow each edit, and resets when editing ends.
  const view = useRef<[number, number, number, number]>([-RANGE, RANGE, RANGE, -RANGE])
  const { points, edges, functions, editing, selected } = props
  const { theme } = useTheme() // axes/labels read CSS colours when drawn, so redraw on a theme change

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const text = css('--c-text-2', '#555'), faint = css('--c-border', '#ddd')
    if (!editing) view.current = [-RANGE, RANGE, RANGE, -RANGE]

    const board: Any = JXG.JSXGraph.initBoard(host, {
      boundingbox: view.current,
      keepAspectRatio: true,
      axis: true,
      grid: false,
      showCopyright: false,
      showNavigation: false,
      resize: { enabled: true, throttle: 100 },
      pan: { enabled: editing, needTwoFingers: false },
      zoom: { wheel: editing, pinch: editing, factorX: 1.15, factorY: 1.15 },
      defaultAxes: {
        x: { strokeColor: text, ticks: { label: { strokeColor: text } } },
        y: { strokeColor: text, ticks: { label: { strokeColor: text } } },
      },
    } as Any)
    board.create('grid', [], { gridX: 1, gridY: 1, strokeColor: faint, strokeOpacity: 0.7, majorStep: 1 })

    props.functions.forEach((expr, i) => {
      try {
        const fn = compileExpr(expr)
        board.create('functiongraph', [(x: number) => { try { return fn(x) } catch { return NaN } }], {
          strokeColor: props.colors[i % props.colors.length], strokeWidth: 2.5, highlight: false, fixed: true,
        })
      } catch { /* invalid expression: the block lists it as invalid */ }
    })

    const byId = new Map<string, Any>()
    const idOf = new Map<string, string>() // JSXGraph element id -> our point id
    points.forEach((p) => {
      const el = board.create('point', [p.x, p.y], {
        name: `(${p.x}, ${p.y})`, size: 4, fixed: !editing, showInfobox: false,
        snapToGrid: true, snapSizeX: 0.5, snapSizeY: 0.5,
        fillColor: p.id === selected ? '#f59e0b' : '#2563eb', strokeColor: p.id === selected ? '#b45309' : '#1d4ed8',
        highlightFillColor: '#f59e0b', label: { fontSize: 11, strokeColor: text, offset: [8, 6] },
      })
      byId.set(p.id, el)
      idOf.set(el.id, p.id)
      el.on('up', () => {
        const x = snap(el.X()), y = snap(el.Y())
        if (Math.abs(x - p.x) > 1e-6 || Math.abs(y - p.y) > 1e-6) latest.current.onPointMoved(p.id, x, y)
      })
    })
    edges.forEach(([a, b]) => {
      const pa = byId.get(a), pb = byId.get(b)
      if (pa && pb) board.create('segment', [pa, pb], { strokeColor: text, strokeWidth: 2, fixed: true, highlight: false })
    })

    // A click is a press and release that barely moved (otherwise it's a pan or a point drag).
    let down: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY } }
    const onUp = (e: PointerEvent) => {
      if (!down) return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
      down = null
      if (moved > 4) { view.current = board.getBoundingBox(); return }
      const p = latest.current
      if (!p.editing) { p.onEnterEdit(); return }
      const hit = (board.getAllObjectsUnderMouse(e) as Any[]).find((o) => idOf.has(o.id))
      if (hit) { p.onPointClick(idOf.get(hit.id) as string); return }
      const [x, y] = board.getUsrCoordsOfMouse(e) as [number, number]
      const sx = snap(x), sy = snap(y)
      if (Math.abs(sx) <= RANGE * 3 && Math.abs(sy) <= RANGE * 3) p.onBackgroundClick(sx, sy)
    }
    const onWheelEnd = () => { view.current = board.getBoundingBox() }
    host.addEventListener('pointerdown', onDown)
    host.addEventListener('pointerup', onUp)
    host.addEventListener('wheel', onWheelEnd)

    return () => {
      host.removeEventListener('pointerdown', onDown)
      host.removeEventListener('pointerup', onUp)
      host.removeEventListener('wheel', onWheelEnd)
      JXG.JSXGraph.freeBoard(board)
    }
  }, [points, edges, functions, editing, selected, props.colors, theme])

  return <div ref={hostRef} className="graph-board jxgbox" />
}
