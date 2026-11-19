// Runtime stats you can read from the browser console (also in production
// builds), to watch for memory growth and lag while using the editor.
//
//   tnbStats()          one snapshot, printed as ONE table: how many elements, how many are
//                       in the viewport, how many heavy ones are loaded, and what changed
//                       (RAM, CPU long tasks, GPU draw calls, FPS) since the previous snapshot
//                       (takes ~1s: it samples FPS)
//   tnbStats.watch(5)   print a snapshot every 5 seconds
//   tnbStats.stop()     stop watching
//   tnbStats.history    every snapshot taken so far (to compare over time)
//
// In dev, a snapshot prints every 10s on its own (?stats=0 turns that off,
// ?stats=5 changes the interval). In production, open with ?stats to start it.
import type * as THREE from 'three'

// 3D viewers register their WebGL renderer here so draw calls can be summed.
const renderers = new Set<THREE.WebGLRenderer>()
export function registerRenderer(r: THREE.WebGLRenderer): void { renderers.add(r) }
export function unregisterRenderer(r: THREE.WebGLRenderer): void { renderers.delete(r) }

// Long tasks (>50ms of blocked main thread) since the page loaded.
const longTasks = { count: 0, totalMs: 0, maxMs: 0 }
try {
  new PerformanceObserver(list => {
    for (const e of list.getEntries()) {
      longTasks.count++
      longTasks.totalMs += e.duration
      longTasks.maxMs = Math.max(longTasks.maxMs, e.duration)
    }
  }).observe({ entryTypes: ['longtask'] })
} catch {
  // not supported in this browser
}

export interface Snapshot {
  time: string
  'JS heap (MB)': number | 'n/a'
  'Heap limit (MB)': number | 'n/a'
  'DOM nodes': number
  'Editor blocks': number
  'Heavy blocks': number
  'Blocks in view': number
  'Heavy in view': number
  'Heavy loaded': number
  'Canvases': number
  '3D scenes live': number
  'Draw calls/frame': number
  'Triangles': number
  'GPU geometries': number
  'GPU textures': number
  'Long tasks': number
  'Long task total (ms)': number
  'Long task max (ms)': number
  'FPS': number
}

const mb = (bytes: number) => Math.round((bytes / 1048576) * 10) / 10

function sampleFps(ms = 1000): Promise<number> {
  return new Promise(resolve => {
    let frames = 0
    const start = performance.now()
    const tick = () => {
      frames++
      const elapsed = performance.now() - start
      if (elapsed >= ms) resolve(Math.round((frames / elapsed) * 1000))
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

// Blocks that cost real memory/GPU when alive: 3D model, graph, circuit, flowchart/diagram, drawing.
const HEAVY = '.model3d-block, .graph-block, .circuit-block, .mm-block, [class*="excalidraw"]'
// What exists inside a heavy block once its library has loaded and drawn it.
const LOADED = 'canvas, .jxgbox svg, .react-flow, .mm-svg svg'

/** Counts the document's top-level blocks: all, heavy, in the viewport, and loaded. */
function scanBlocks(root: Element | null) {
  const out = { total: 0, heavy: 0, inView: 0, heavyInView: 0, heavyLoaded: 0 }
  if (!root) return out
  const vh = window.innerHeight
  for (const child of Array.from(root.children)) {
    out.total++
    const isHeavy = child.matches(HEAVY) || child.querySelector(HEAVY) !== null
    const r = child.getBoundingClientRect()
    const visible = r.bottom > 0 && r.top < vh
    if (visible) out.inView++
    if (isHeavy) {
      out.heavy++
      if (visible) out.heavyInView++
      if (child.querySelector(LOADED)) out.heavyLoaded++
    }
  }
  return out
}

async function snapshot(): Promise<Snapshot> {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory
  let calls = 0, triangles = 0, geometries = 0, textures = 0
  renderers.forEach(r => {
    calls += r.info.render.calls
    triangles += r.info.render.triangles
    geometries += r.info.memory.geometries
    textures += r.info.memory.textures
  })
  const root = document.querySelector('[contenteditable="true"], [contenteditable="false"][data-lexical-editor]')
  const fps = await sampleFps()
  const blocks = scanBlocks(root)
  const snap: Snapshot = {
    time: new Date().toLocaleTimeString(),
    'JS heap (MB)': memory ? mb(memory.usedJSHeapSize) : 'n/a',
    'Heap limit (MB)': memory ? mb(memory.jsHeapSizeLimit) : 'n/a',
    'DOM nodes': document.getElementsByTagName('*').length,
    'Editor blocks': blocks.total,
    'Heavy blocks': blocks.heavy,
    'Blocks in view': blocks.inView,
    'Heavy in view': blocks.heavyInView,
    'Heavy loaded': blocks.heavyLoaded,
    'Canvases': document.getElementsByTagName('canvas').length,
    '3D scenes live': renderers.size,
    'Draw calls/frame': calls,
    'Triangles': triangles,
    'GPU geometries': geometries,
    'GPU textures': textures,
    'Long tasks': longTasks.count,
    'Long task total (ms)': Math.round(longTasks.totalMs),
    'Long task max (ms)': Math.round(longTasks.maxMs),
    'FPS': fps,
  }
  history.push(snap)
  if (history.length > 200) history.shift()
  return snap
}

const history: Snapshot[] = []
const prevAt = { manual: performance.now(), watch: performance.now() }
let timer: ReturnType<typeof setInterval> | null = null

const signed = (n: number, unit = '') => (n > 0 ? '+' : '') + Math.round(n * 100) / 100 + unit
// Each way of asking compares against its OWN previous snapshot. Otherwise the
// automatic 10-second print (dev) would become the "previous" for a manual
// tnbStats() and hide what changed, e.g. a 3D model that loaded in between.
const lastBySource: { manual?: Snapshot; watch?: Snapshot } = {}

// Printed like a small report: the elements, then "1 - before" and "2 - now" (what is in
// the viewport, what is loaded, RAM, CPU, GPU), a one-line verdict, then FPS for both.
function describe(snap: Snapshot): string {
  const heavy = snap['Heavy blocks']
  if (heavy === 0) return 'Only light elements (text, tables, simple blocks), nothing heavy in the document'
  if (snap['Heavy loaded'] === 0) return `Only light elements active, ${heavy} heavy element${heavy > 1 ? 's' : ''} not loaded yet`
  const threeD = snap['3D scenes live'] ? `, ${snap['3D scenes live']} 3D scene${snap['3D scenes live'] > 1 ? 's' : ''} live` : ''
  return `${snap['Heavy loaded']} of ${heavy} heavy element${heavy > 1 ? 's' : ''} loaded${threeD}`
}

function stateRows(snap: Snapshot, extra: { Metric: string; Value: string | number }[] = []) {
  const heap = snap['JS heap (MB)']
  return [
    { Metric: 'In viewport (all elements)', Value: `${snap['Blocks in view']} of ${snap['Editor blocks']}` },
    { Metric: 'In viewport (heavy elements)', Value: `${snap['Heavy in view']} of ${snap['Heavy blocks']}` },
    { Metric: 'Heavy loaded (live)', Value: snap['Heavy loaded'] },
    { Metric: '3D scenes live', Value: snap['3D scenes live'] },
    { Metric: 'RAM', Value: heap === 'n/a' ? 'n/a' : `${heap} MB` },
    ...extra,
    { Metric: 'CPU long tasks', Value: snap['Long tasks'] },
    { Metric: 'GPU draw calls', Value: `${snap['Draw calls/frame']} per frame` },
  ]
}

async function take(source: 'manual' | 'watch'): Promise<Snapshot> {
  const prev = lastBySource[source]
  const snap = await snapshot()
  lastBySource[source] = snap
  const secs = prev ? Math.max(1, Math.round((performance.now() - prevAt[source]) / 1000)) : 0
  prevAt[source] = performance.now()

  console.log(`[tnbStats] ${snap.time}`)
  console.log('Elements')
  console.table([
    { Count: 'Total elements in doc', Value: snap['Editor blocks'] },
    { Count: 'Light (text) elements', Value: snap['Editor blocks'] - snap['Heavy blocks'] },
    { Count: 'Heavy elements (3D, graph, circuit, flowchart, drawing)', Value: snap['Heavy blocks'] },
  ])

  if (!prev) {
    console.log(`1 \u2014 ${describe(snap)}`)
    console.table(stateRows(snap))
    console.log('FPS')
    console.table([{ State: describe(snap), FPS: snap.FPS }])
    console.info('Scroll to a heavy element, then run tnbStats() again to see what it changed.')
    return snap
  }

  const heapNow = snap['JS heap (MB)'], heapPrev = prev['JS heap (MB)']
  const ramDelta = typeof heapNow === 'number' && typeof heapPrev === 'number' ? Math.round((heapNow - heapPrev) * 100) / 100 : null
  const flat = ramDelta !== null && Math.abs(ramDelta) < 0.5
  const newLong = snap['Long tasks'] - prev['Long tasks']

  console.log(`1 \u2014 ${describe(prev)}`)
  console.table(stateRows(prev))
  console.log(`2 \u2014 ${describe(snap)}  (after ${secs}s)`)
  console.table(stateRows(snap, [
    { Metric: `RAM change over ${secs}s`, Value: ramDelta === null ? 'n/a' : `${signed(ramDelta, ' MB')}${flat ? ' (flat/idle)' : ''}` },
  ]))

  const loadedDelta = snap['Heavy loaded'] - prev['Heavy loaded']
  const what = loadedDelta > 0 ? `right when ${loadedDelta} heavy element${loadedDelta > 1 ? 's' : ''} loaded`
    : loadedDelta < 0 ? `after ${-loadedDelta} heavy element${loadedDelta < -1 ? 's' : ''} unloaded` : 'with no heavy element loading or unloading'
  const ramText = ramDelta === null ? '' : `RAM ${heapPrev} MB \u2192 ${heapNow} MB (${signed(ramDelta, ' MB')}) ${what}. `
  console.log(
    `${ramText}CPU: ${newLong === 0 ? 'clean, no blocking' : `${newLong} long task${newLong > 1 ? 's' : ''} (>50 ms)`}. ` +
    `GPU draw calls ${prev['Draw calls/frame']} \u2192 ${snap['Draw calls/frame']} per frame. ` +
    '(3D and graphs start loading ~200px before they enter the view.)',
  )
  console.log('FPS')
  console.table([
    { State: describe(prev), FPS: prev.FPS },
    { State: describe(snap), FPS: snap.FPS },
  ])
  return snap
}

const once = () => take('manual')

function watch(seconds = 5): void {
  stop()
  void take('watch')
  timer = setInterval(() => void take('watch'), Math.max(1, seconds) * 1000)
  console.info(`[tnbStats] printing every ${seconds}s. tnbStats.stop() to stop.`)
}

function stop(): void {
  if (timer) clearInterval(timer)
  timer = null
}

export const tnbStats = Object.assign(once, { watch, stop, history })

;(window as unknown as { tnbStats: typeof tnbStats }).tnbStats = tnbStats

// In dev it starts by itself (every 10s); add ?stats=0 to switch that off, or
// ?stats=5 to change the interval. In a production build it only runs when
// asked for (?stats or tnbStats()).
const param = new URLSearchParams(window.location.search).get('stats')
if (param === '0') {
  // explicitly off
} else if (param !== null) {
  watch(Number(param) || 5)
} else if (import.meta.env.DEV) {
  watch(10)
}
