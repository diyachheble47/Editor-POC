// Runtime stats you can read from the browser console (also in production
// builds), to watch for memory growth and lag while using the editor.
//
//   tnbStats()          one snapshot, printed as a table (takes ~1s: it samples FPS)
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
  const snap: Snapshot = {
    time: new Date().toLocaleTimeString(),
    'JS heap (MB)': memory ? mb(memory.usedJSHeapSize) : 'n/a',
    'Heap limit (MB)': memory ? mb(memory.jsHeapSizeLimit) : 'n/a',
    'DOM nodes': document.getElementsByTagName('*').length,
    'Editor blocks': root ? root.children.length : 0,
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
let timer: ReturnType<typeof setInterval> | null = null

async function once(): Promise<Snapshot> {
  const snap = await snapshot()
  // One plain line (always visible, easy to copy) plus the full table.
  console.log(
    `[tnbStats] heap ${snap['JS heap (MB)']}MB · dom ${snap['DOM nodes']} · blocks ${snap['Editor blocks']} · ` +
    `3D scenes ${snap['3D scenes live']} · draw calls ${snap['Draw calls/frame']} · ` +
    `long tasks ${snap['Long tasks']} · fps ${snap.FPS}`,
  )
  console.table(snap)
  return snap
}

function watch(seconds = 5): void {
  stop()
  void once()
  timer = setInterval(() => void once(), Math.max(1, seconds) * 1000)
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
