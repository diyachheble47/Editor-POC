// ResizeFrame — wraps a block (image, video, embed) in a centred box with four
// corner handles. Dragging any corner resizes the box proportionally and the
// corner stays under the pointer. The width is written straight to the DOM
// while dragging (no React / Lexical work per mouse move) and committed once on
// release, so resizing never lags the editor.

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type Corner = 'nw' | 'ne' | 'sw' | 'se'
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']

/**
 * `height` is optional: when omitted the box keeps its natural height (images).
 * With `resizeHeight`, the bottom/top corners also change the height, and
 * `onCommit` receives the new height as its second argument.
 */
export function ResizeFrame({
  width, height, min = 120, max = 1400, minHeight = 80, maxHeight = 2000, resizeHeight = false,
  onCommit, children, className = '',
}: {
  width: number
  height?: number
  min?: number
  max?: number
  minHeight?: number
  maxHeight?: number
  resizeHeight?: boolean
  onCommit: (width: number, height?: number) => void
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)   // clicked / being dragged
  const [dragging, setDragging] = useState(false)

  // Click outside → hide the handles again (touch screens have no hover).
  useEffect(() => {
    if (!active) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setActive(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [active])

  function start(corner: Corner) {
    return (e: React.PointerEvent<HTMLDivElement>) => {
      const box = ref.current
      if (!box) return
      e.preventDefault()
      e.stopPropagation()
      const handle = e.currentTarget
      handle.setPointerCapture(e.pointerId)
      const side = corner.endsWith('e') ? 1 : -1
      const startX = e.clientX
      const startY = e.clientY
      const startWidth = box.offsetWidth
      const startHeight = box.offsetHeight
      const vSide = corner.startsWith('s') ? 1 : -1
      const limit = Math.min(max, box.parentElement?.clientWidth ?? max)
      let latest = startWidth
      let latestHeight = startHeight
      setDragging(true)
      const move = (ev: PointerEvent) => {
        // The frame is centred, so each side moves half the width change.
        latest = Math.round(Math.max(min, Math.min(limit, startWidth + side * 2 * (ev.clientX - startX))))
        box.style.width = `${latest}px`
        if (resizeHeight) {
          latestHeight = Math.round(Math.max(minHeight, Math.min(maxHeight, startHeight + vSide * (ev.clientY - startY))))
          box.style.height = `${latestHeight}px`
        }
      }
      const up = () => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        handle.removeEventListener('pointercancel', up)
        setDragging(false)
        const widthChanged = latest !== startWidth
        const heightChanged = resizeHeight && latestHeight !== startHeight
        if (widthChanged || heightChanged) onCommit(latest, resizeHeight ? latestHeight : undefined)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
      handle.addEventListener('pointercancel', up)
    }
  }

  return (
    <div
      ref={ref}
      className={`rz-frame${active ? ' rz-active' : ''}${dragging ? ' rz-dragging' : ''} ${className}`}
      style={{ width, ...(height !== undefined ? { height } : null) }}
      onPointerDown={() => setActive(true)}
    >
      {children}
      {CORNERS.map(c => (
        <div key={c} className={`rz-handle rz-${c}`} title="Drag to resize" onPointerDown={start(c)} />
      ))}
    </div>
  )
}
