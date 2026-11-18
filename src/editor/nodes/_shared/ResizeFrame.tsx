// ResizeFrame — wraps a block (image, video, embed) in a centred box with four
// corner handles. Dragging any corner resizes the box proportionally and the
// corner stays under the pointer. The width is written straight to the DOM
// while dragging (no React / Lexical work per mouse move) and committed once on
// release, so resizing never lags the editor.

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type Corner = 'nw' | 'ne' | 'sw' | 'se'
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']

export function ResizeFrame({
  width, min = 120, max = 1400, onCommit, children, className = '',
}: {
  width: number
  min?: number
  max?: number
  onCommit: (width: number) => void
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
      const startWidth = box.offsetWidth
      const limit = Math.min(max, box.parentElement?.clientWidth ?? max)
      let latest = startWidth
      setDragging(true)
      const move = (ev: PointerEvent) => {
        // The frame is centred, so each side moves half the width change.
        latest = Math.round(Math.max(min, Math.min(limit, startWidth + side * 2 * (ev.clientX - startX))))
        box.style.width = `${latest}px`
      }
      const up = () => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        handle.removeEventListener('pointercancel', up)
        setDragging(false)
        if (latest !== startWidth) onCommit(latest)
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
      style={{ width }}
      onPointerDown={() => setActive(true)}
    >
      {children}
      {CORNERS.map(c => (
        <div key={c} className={`rz-handle rz-${c}`} title="Drag to resize" onPointerDown={start(c)} />
      ))}
    </div>
  )
}
