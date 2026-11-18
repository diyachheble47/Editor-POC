// Draws a rounded card behind each section: from a Section heading down to the
// next Section, a level-1 heading or a divider. The cards are plain boxes laid
// *behind* the editor (not wrapped around the blocks), so the document itself
// stays a flat list: dragging, undo, saving and the AI edit all work as before.
//
// Cost: the regions are re-worked out only when the block list changes; on
// other updates just the first and last block of each card are measured.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot, $isParagraphNode } from 'lexical'
import { $isHeadingNode } from '@lexical/rich-text'
import { $isHorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode'

type Region = { first: string; last: string }
type Card = { top: number; height: number }

const PAD_TOP = 22
const PAD_BOTTOM = 14

function findRegions(editor: ReturnType<typeof useLexicalComposerContext>[0]): Region[] {
  return editor.getEditorState().read(() => {
    const children = $getRoot().getChildren()
    const out: Region[] = []
    let cur: Region | null = null
    children.forEach((child, i) => {
      if (child.getType() === 'section') {
        if (cur) out.push(cur)
        cur = { first: child.getKey(), last: child.getKey() }
      } else if (cur && (($isHeadingNode(child) && child.getTag() === 'h1') || $isHorizontalRuleNode(child))) {
        out.push(cur)
        cur = null
      } else if (cur) {
        // The empty paragraph kept at the end of the document is not part of the card.
        const trailing = i === children.length - 1 && $isParagraphNode(child) && child.getTextContent() === ''
        if (!trailing) cur.last = child.getKey()
      }
    })
    if (cur) out.push(cur)
    return out
  })
}

const same = (a: Card[], b: Card[]) =>
  a.length === b.length && a.every((c, i) => Math.abs(c.top - b[i].top) < 0.5 && Math.abs(c.height - b[i].height) < 0.5)

export function SectionCardsPlugin() {
  const [editor] = useLexicalComposerContext()
  const [cards, setCards] = useState<Card[]>([])
  const [host, setHost] = useState<HTMLElement | null>(null)
  const regions = useRef<Region[]>([])
  const frame = useRef(0)

  useEffect(() => {
    const root = editor.getRootElement()
    const box = root?.parentElement ?? null
    setHost(box)
    if (!root || !box) return

    const measure = () => {
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        const boxTop = box.getBoundingClientRect().top
        const next: Card[] = []
        for (const r of regions.current) {
          const a = editor.getElementByKey(r.first)
          const b = editor.getElementByKey(r.last)
          if (!a || !b) continue
          const ra = a.getBoundingClientRect()
          const rb = b.getBoundingClientRect()
          next.push({ top: ra.top - boxTop - PAD_TOP, height: rb.bottom - ra.top + PAD_TOP + PAD_BOTTOM })
        }
        setCards(prev => (same(prev, next) ? prev : next))
      })
    }

    regions.current = findRegions(editor)
    measure()

    const off = editor.registerUpdateListener(({ dirtyElements }) => {
      if (dirtyElements.get('root') === true) regions.current = findRegions(editor)
      measure()
    })
    // Images, graphs and other lazy blocks change height after they load.
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    window.addEventListener('resize', measure)
    return () => {
      off()
      ro.disconnect()
      window.removeEventListener('resize', measure)
      cancelAnimationFrame(frame.current)
    }
  }, [editor])

  if (!host || cards.length === 0) return null
  return createPortal(
    <>{cards.map((c, i) => <div key={i} className="section-card" style={{ top: c.top, height: c.height }} aria-hidden="true" />)}</>,
    host,
  )
}
