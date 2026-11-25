// ResizeFrame — wraps a block (image, video, embed, diagram) in a box with resize handles.
//
//  - The side opposite the handle stays where it is, like in other editors: drag the right side
//    and the left edge does not move (drag the left side and the right edge does not move). The
//    block then leans toward the side that stayed put (left / right); a small align control on
//    the block puts it back in the middle, or moves it.
//  - Corners and sides: the four corners and the left / right sides (and the bottom side when the
//    frame has a height of its own) can all be dragged. The handles are bigger than they look, so
//    they are easy to hit, and they stay visible while the block is hovered or selected.
//  - A corner keeps the shape of a diagram; a side changes one direction only (see resizeMath.ts).
//  - A small label shows the size while dragging and snaps to 25 / 50 / 75 / 100% of the page
//    (hold Alt to turn that off).
//  - Smooth: the size is written straight to the DOM once per animation frame (no React or
//    Lexical work per mouse move) and committed once on release, so resizing never lags.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { alignAfter, anchoredLeft, cursorFor, resizeBox, sizeLabel } from './resizeMath'
import type { Align, Handle } from './resizeMath'

export type { Align } from './resizeMath'

const SIDES: Handle[] = ['e', 'w']
const CORNERS: Handle[] = ['nw', 'ne', 'sw', 'se']
// A diagram's top corners could not follow the pointer (its top edge stays put), so it has none.
const BOTTOM_CORNERS: Handle[] = ['sw', 'se']
const ALIGNS: { value: Align; label: string; icon: ReactNode }[] = [
  { value: 'left', label: 'Align left', icon: <path d="M2 3h12M2 7h7M2 11h12M2 15h7" /> },
  { value: 'center', label: 'Align center', icon: <path d="M2 3h12M4.5 7h7M2 11h12M4.5 15h7" /> },
  { value: 'right', label: 'Align right', icon: <path d="M2 3h12M7 7h7M2 11h12M7 15h7" /> },
]

/**
 * `height` is optional: when omitted the box keeps its natural height (images).
 * With `resizeHeight`, the corners keep the shape and the bottom side changes the height;
 * `onCommit` receives the new height as its second argument and the new alignment as its third.
 */
export function ResizeFrame({
  width, height, align = 'center', min = 120, max = 1400, minHeight = 80, maxHeight = 2000, resizeHeight = false,
  onCommit, onAlign, children, className = '',
}: {
  width: number
  height?: number
  align?: Align
  min?: number
  max?: number
  minHeight?: number
  maxHeight?: number
  resizeHeight?: boolean
  onCommit: (width: number, height: number | undefined, align: Align) => void
  /** Shows the align control when given. */
  onAlign?: (align: Align) => void
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)   // clicked / being dragged
  const [dragging, setDragging] = useState(false)
  // Where the box was (viewport left) before its alignment changed: it then slides to its new place.
  const slideFrom = useRef<number | null>(null)

  // Click outside → hide the handles again (touch screens have no hover).
  useEffect(() => {
    if (!active) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setActive(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [active])

  // After a commit the real alignment class takes over from the margins set while dragging, and
  // the box glides from where it was left to where its alignment puts it (no jump on release).
  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    box.style.marginLeft = ''
    box.style.marginRight = ''
    const from = slideFrom.current
    slideFrom.current = null
    if (from === null || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const dx = from - box.getBoundingClientRect().left
    if (Math.abs(dx) > 1) {
      box.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
    }
  }, [align, width, height])

  function start(handle: Handle) {
    return (e: React.PointerEvent<HTMLDivElement>) => {
      const box = ref.current
      const parent = box?.parentElement
      if (!box || !parent) return
      e.preventDefault()
      e.stopPropagation()
      const grip = e.currentTarget
      grip.setPointerCapture(e.pointerId)
      const startX = e.clientX
      const startY = e.clientY
      const startW = box.offsetWidth
      const startH = box.offsetHeight
      const column = parent.clientWidth
      const parentStyle = getComputedStyle(parent)
      const contentLeft = parent.getBoundingClientRect().left + parent.clientLeft + parseFloat(parentStyle.paddingLeft)
      const startLeft = box.getBoundingClientRect().left - contentLeft
      const sideways = handle !== 's' // the bottom side never moves the box sideways
      const limits = { minW: min, maxW: Math.min(max, column), minH: minHeight, maxH: maxHeight }
      let last = { w: startW, h: resizeHeight ? startH : undefined as number | undefined }
      let pointer = { x: startX, y: startY, alt: false }
      let frame = 0
      const badge = badgeRef.current
      const previousCursor = document.body.style.cursor
      document.body.style.cursor = cursorFor(handle)
      setDragging(true)

      const paint = () => {
        frame = 0
        const r = resizeBox({
          handle, w: startW, h: startH, dx: pointer.x - startX, dy: pointer.y - startY,
          limits, withHeight: resizeHeight, column, snap: !pointer.alt,
        })
        last = { w: r.w, h: r.h }
        box.style.width = `${r.w}px`
        if (r.h !== undefined) box.style.height = `${r.h}px`
        if (sideways) {
          // Pin the side that is not being dragged: the box is placed by hand while the drag lasts.
          box.style.marginLeft = `${anchoredLeft(handle, startLeft, startW, r.w, column)}px`
          box.style.marginRight = '0'
        }
        if (badge) {
          badge.textContent = sizeLabel(r, column)
          badge.classList.toggle('rz-snapped', r.snappedTo !== null)
        }
      }
      const move = (ev: PointerEvent) => {
        pointer = { x: ev.clientX, y: ev.clientY, alt: ev.altKey }
        if (!frame) frame = requestAnimationFrame(paint)
      }
      const up = () => {
        if (frame) { cancelAnimationFrame(frame); paint() }
        grip.removeEventListener('pointermove', move)
        grip.removeEventListener('pointerup', up)
        grip.removeEventListener('pointercancel', up)
        document.body.style.cursor = previousCursor
        setDragging(false)
        const widthChanged = last.w !== startW
        const heightChanged = resizeHeight && last.h !== startH
        if (widthChanged || heightChanged) {
          slideFrom.current = box.getBoundingClientRect().left
          onCommit(last.w, resizeHeight ? last.h : undefined, sideways ? alignAfter(handle, align) : align)
        } else {
          box.style.marginLeft = ''
          box.style.marginRight = ''
        }
      }
      grip.addEventListener('pointermove', move)
      grip.addEventListener('pointerup', up)
      grip.addEventListener('pointercancel', up)
      // Show the current size right away. Not through paint(): a click without a move must not snap or change anything.
      if (badge) badge.textContent = sizeLabel({ w: startW, h: resizeHeight ? startH : undefined, snappedTo: null }, column)
    }
  }

  const handles: Handle[] = resizeHeight ? [...BOTTOM_CORNERS, ...SIDES, 's'] : [...CORNERS, ...SIDES]

  return (
    <div
      ref={ref}
      className={`rz-frame rz-pos-${align}${active ? ' rz-active' : ''}${dragging ? ' rz-dragging' : ''} ${className}`}
      style={{ width, ...(height !== undefined ? { height } : null) }}
      // Capture phase: a player or diagram inside may stop the event, and touch screens
      // (no hover) still need the first tap to bring the handles up.
      onPointerDownCapture={() => setActive(true)}
    >
      {children}
      {onAlign && (
        <div className="rz-align" role="group" aria-label="Alignment" onPointerDown={e => e.stopPropagation()}>
          {ALIGNS.map(a => (
            <button
              key={a.value}
              type="button"
              className={`rz-align-btn${align === a.value ? ' on' : ''}`}
              title={a.label}
              aria-label={a.label}
              aria-pressed={align === a.value}
              onClick={() => {
                if (a.value === align) return
                slideFrom.current = ref.current?.getBoundingClientRect().left ?? null
                onAlign(a.value)
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">{a.icon}</svg>
            </button>
          ))}
        </div>
      )}
      {handles.map(h => (
        <div key={h} className={`rz-handle rz-${h}`} title="Drag to resize" onPointerDown={start(h)} />
      ))}
      <div className="rz-size" ref={badgeRef} aria-hidden="true" />
    </div>
  )
}
