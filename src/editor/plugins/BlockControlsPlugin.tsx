import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  $isDecoratorNode,
  $isElementNode,
  $isParagraphNode,
  $isTextNode,
} from 'lexical'
import { $createListItemNode, $isListItemNode, $isListNode } from '@lexical/list'
import type { ElementNode, LexicalEditor, LexicalNode, NodeKey } from 'lexical'
import { setSelectedBlockKey } from '../blockSelection'
import { dragLabel, dropSlot, edgeScrollSpeed, isNoopSlot, slotLineY } from './blockDrag'

function $cloneNodeShallow(node: LexicalNode): LexicalNode {
  // Each Lexical node class has a static clone method
  const NodeClass = node.constructor as { clone: (n: LexicalNode) => LexicalNode }
  return NodeClass.clone(node)
}

function $deepCloneElement(node: ElementNode): ElementNode {
  const clone = $cloneNodeShallow(node) as ElementNode
  node.getChildren().forEach(child => {
    if ($isTextNode(child)) {
      clone.append($cloneNodeShallow(child))
    } else if ($isElementNode(child)) {
      clone.append($deepCloneElement(child))
    } else {
      clone.append($cloneNodeShallow(child))
    }
  })
  return clone
}

// Hover controls, drag, and drop only ever match a direct child of root —
// content inside a column (ColumnsPlugin) has no drag handle. Shared by the
// root pointer listeners and the pointer-driven drag below, which both need
// to resolve "which top-level block is at this point" outside of a hover
// event's own target.
function resolveBlockElement(root: HTMLElement, target: EventTarget | null): HTMLElement | null {
  let elem = target as HTMLElement | null
  while (elem && elem !== root && elem.parentElement !== root) {
    elem = elem.parentElement
  }
  return elem && elem !== root ? elem : null
}

interface CtrlPos {
  top: number   // viewport-relative, center of block
  left: number  // viewport-relative, left edge of block
}

const TEXT_BLOCK = 'p, h1, h2, h3, h4, h5, h6, li, blockquote'

/** Where the controls go for `el`: level with the first line of a text block, near the top of a tall one. */
function controlTopFor(el: HTMLElement): number {
  const rect = el.getBoundingClientRect()
  if (el.matches(TEXT_BLOCK)) {
    const style = getComputedStyle(el)
    const lh = parseFloat(style.lineHeight)
    const line = Number.isFinite(lh) ? lh : parseFloat(style.fontSize) * 1.5
    return rect.top + (parseFloat(style.paddingTop) || 0) + line / 2
  }
  return rect.top + Math.min(rect.height / 2, 24)
}

/** The controls stay in one column: at the left edge of the top-level block (a list item uses its list's edge). */
function placeOf(editor: LexicalEditor, el: HTMLElement): CtrlPos {
  const root = editor.getRootElement()
  const edge = (root ? resolveBlockElement(root, el) : null) ?? el
  return { top: controlTopFor(el), left: edge.getBoundingClientRect().left }
}

/** A list item that only holds a nested list: it belongs to the item before it, so it is never a block of its own. */
function $isNestedWrapper(node: LexicalNode | null): boolean {
  return !!node && $isListItemNode(node) && node.getChildrenSize() === 1 && $isListNode(node.getFirstChild())
}

/** The nodes that move, copy and go together: a list item and the nested list under it. */
function $unitNodes(node: LexicalNode): LexicalNode[] {
  if (!$isListItemNode(node)) return [node]
  const next = node.getNextSibling()
  return next && $isNestedWrapper(next) ? [node, next] : [node]
}

/** The block under the pointer: one list item inside a list, otherwise the top-level block. */
function unitAt(editor: LexicalEditor, root: HTMLElement, target: EventTarget | null, y: number): { key: NodeKey; el: HTMLElement } | null {
  const top = resolveBlockElement(root, target)
  if (!top) return null
  if (top.tagName === 'UL' || top.tagName === 'OL') {
    let hit: HTMLElement | null = null
    for (const li of Array.from(top.querySelectorAll<HTMLElement>('li'))) {
      if (li.classList.contains('editor-listitem-nested')) continue
      const r = li.getBoundingClientRect()
      if (y >= r.top && y <= r.bottom) hit = li
    }
    if (!hit) return null
    const el: HTMLElement = hit
    let key: NodeKey | null = null
    editor.read(() => {
      const n = $getNearestNodeFromDOMNode(el)
      if (n && $isListItemNode(n)) key = n.getKey()
    })
    return key ? { key, el } : null
  }
  let key: NodeKey | null = null
  editor.getEditorState().read(() => {
    for (const child of $getRoot().getChildren()) {
      if (editor.getElementByKey(child.getKey()) === top) { key = child.getKey(); break }
    }
  })
  return key ? { key, el: top } : null
}

export function BlockControlsPlugin() {
  const [editor] = useLexicalComposerContext()
  const [ctrlPos, setCtrlPos] = useState<CtrlPos | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  // Dragging: the line and the floating preview are moved by hand each frame (no React renders per move).
  const [dragging, setDragging] = useState(false)
  const [ghostLabel, setGhostLabel] = useState('')
  const lineRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const nodeKeyRef = useRef<NodeKey | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuOpenRef = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootCleanupRef = useRef<(() => void) | null>(null)
  const selectedKeyRef = useRef<NodeKey | null>(null)
  // The highlight lives on the real block element itself (a CSS class), not a
  // separately-positioned overlay — a `position: fixed` box computed once at
  // click time has no way to track the page being scrolled afterward, which
  // is exactly what made it look stuck/detached as the content moved under it.
  const selectedElemRef = useRef<HTMLElement | null>(null)
  const rootElRef = useRef<HTMLElement | null>(null)
  const suppressClickRef = useRef(false)
  // The one empty line of a new document: its controls stay up (see the effect below).
  const emptyDocKeyRef = useRef<NodeKey | null>(null)

  // blockSelection's selected key is a plain module-level singleton, living
  // outside React — so it survives this component unmounting. The editor
  // itself doesn't: <LexicalComposer key={activeDocId}> (App.tsx) fully
  // remounts on every document switch specifically because Lexical NodeKeys
  // are only unique *within one editor instance* — a small key like "5" is
  // reused across unrelated documents' node trees. Without clearing the
  // singleton here too, a block selected in document A would leave its key
  // sitting there after switching to document B, where that same key can
  // legitimately resolve to a completely different node — so Alt+Shift+↑/↓
  // in BlockMovementPlugin, right after switching documents and before
  // clicking anything, could silently move the wrong block.
  useEffect(() => {
    return () => setSelectedBlockKey(null)
  }, [])

  useEffect(() => { menuOpenRef.current = menuOpen }, [menuOpen])

  const deselectBlock = useCallback(() => {
    selectedElemRef.current?.classList.remove('block-selected')
    selectedElemRef.current = null
    selectedKeyRef.current = null
    setSelectedBlockKey(null)
  }, [])

  const selectBlock = useCallback((key: NodeKey, elem: HTMLElement) => {
    if (selectedElemRef.current === elem) return
    selectedElemRef.current?.classList.remove('block-selected')
    elem.classList.add('block-selected')
    selectedElemRef.current = elem
    selectedKeyRef.current = key
    setSelectedBlockKey(key)
  }, [])

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const scheduleHide = useCallback(() => {
    cancelHide()
    hideTimerRef.current = setTimeout(() => {
      if (emptyDocKeyRef.current) return
      if (!menuOpenRef.current && !draggingRef.current) {
        setCtrlPos(null)
        nodeKeyRef.current = null
      }
    }, 500) // long enough to cross the gap between a block and its handle
  }, [cancelHide])

  // While the document is just one empty line (a new document), the drag handle and "+" stay next to it,
  // so a teacher who arrives for the first time sees how to add a block. Typing takes it back to hover.
  useEffect(() => {
    const sync = () => {
      const key = editor.getEditorState().read((): NodeKey | null => {
        const kids = $getRoot().getChildren()
        const only = kids.length === 1 ? kids[0] : null
        return editor.isEditable() && only && $isParagraphNode(only) && only.getTextContent() === '' ? only.getKey() : null
      })
      const was = emptyDocKeyRef.current
      emptyDocKeyRef.current = key
      if (!key) { if (was) scheduleHide(); return }
      const el = editor.getElementByKey(key)
      if (!el || draggingRef.current || menuOpenRef.current) return
      cancelHide()
      nodeKeyRef.current = key
      const next = placeOf(editor, el)
      setCtrlPos(prev => (prev && prev.top === next.top && prev.left === next.left ? prev : next))
    }
    sync()
    const off = editor.registerUpdateListener(() => { requestAnimationFrame(sync) })
    window.addEventListener('resize', sync)
    // The first paint of a new document can land after this effect: look once more.
    const t = setTimeout(sync, 300)
    return () => { off(); window.removeEventListener('resize', sync); clearTimeout(t) }
  }, [editor, cancelHide, scheduleHide])

  // The controls are drawn at fixed screen positions, so when the page scrolls or the line changes height
  // (the slash menu scrolling the caret into view, typing) they have to follow their block.
  useEffect(() => {
    const follow = () => {
      const key = nodeKeyRef.current
      if (!key || draggingRef.current) return
      const el = editor.getElementByKey(key)
      if (!el) return
      const next = placeOf(editor, el)
      setCtrlPos(prev => (prev && (prev.top !== next.top || prev.left !== next.left) ? next : prev))
    }
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    const off = editor.registerUpdateListener(() => { requestAnimationFrame(follow) })
    return () => { window.removeEventListener('scroll', follow, true); window.removeEventListener('resize', follow); off() }
  }, [editor])

  useEffect(() => {
    const unregisterRootListener = editor.registerRootListener((root) => {
      rootCleanupRef.current?.()
      rootCleanupRef.current = null

      if (!root) return
      rootElRef.current = root

      // Scope limit, not an oversight: content inside a column (ColumnsPlugin)
      // has no drag handle and can't be reordered this way. Supporting it
      // would mean resolving a hovered column child back to root-relative
      // coordinates, plus deciding semantics for dragging a block across
      // column boundaries or out of a column entirely — a real feature
      // addition, not a bug fix. Content inside columns can still be edited,
      // selected, and reordered via cut/paste; it simply doesn't have the
      // hover drag affordance.
      function resolveHoveredBlock(target: EventTarget | null): HTMLElement | null {
        return resolveBlockElement(root!, target)
      }

      function onPointerMove(e: PointerEvent) {
        // Touch has no hover: a touchmove only fires while a finger is down
        // and sliding, which is a scroll gesture here, not "show me the
        // controls for whatever's under my finger" — leave reveal-by-touch
        // to the tap handling in onPointerDown below.
        if (e.pointerType === 'touch') return
        cancelHide()

        const elem = resolveHoveredBlock(e.target)
        if (!elem) {
          scheduleHide()
          return
        }
        // A /generate or /agent prompt line shows its own mode badge in this gutter.
        if (elem.classList.contains('gl-line')) {
          nodeKeyRef.current = null
          setCtrlPos(null)
          return
        }

        const unit = unitAt(editor, root!, e.target, e.clientY)
        if (!unit) {
          scheduleHide()
          return
        }
        nodeKeyRef.current = unit.key
        setCtrlPos(placeOf(editor, unit.el))
      }

      function onPointerLeave() {
        scheduleHide()
      }

      // Clicking directly on a non-text block (molecule, graph, equation,
      // matrix, geometry, spreadsheet, 3D model, …) selects it for deletion
      // via the Delete/Backspace key — those blocks render their own
      // interactive canvas/controls with contentEditable={false}, so Lexical
      // never gets a normal text selection inside them to hang a keyboard
      // shortcut off of. A plain text block (paragraph, heading, list, …)
      // clears the selection instead, deferring to normal text editing.
      //
      // Matches only when the nearest Lexical node *is itself* a decorator —
      // checked with $isDecoratorNode on that exact node, never by walking up
      // its ancestors. An earlier version walked node.getParent() checking
      // each ancestor's subtree for *any* contentEditable="false" descendant,
      // meant to handle a decorator that ended up nested inside a paragraph's
      // text; it over-reached in a far worse way instead. Every ancestor walk
      // that found no match eventually reached $getRoot() itself — and root's
      // own DOM contains a contentEditable="false" descendant the moment the
      // document has *any* decorator block *anywhere*, matching almost every
      // document. That selected the entire root node for deletion on an
      // ordinary click in plain text, and Delete on it threw ("remove: cannot
      // be called on root nodes") instead of deleting anything. Checking the
      // single clicked-through node directly needs no walk at all: Lexical's
      // own DOM-to-node map already resolves a click anywhere inside a
      // decorator's rendered content (however deeply nested under a
      // paragraph) straight to that decorator node, not to an ancestor.
      function onPointerDown(e: PointerEvent) {
        // No hover on touch, so a tap doubles as the reveal gesture: show
        // the drag-handle/add-button pair for whatever block was tapped,
        // same position a mouse hover would've produced. Tapping empty
        // space below the last block hides them again.
        if (e.pointerType === 'touch') {
          cancelHide()
          const unit = unitAt(editor, root!, e.target, e.clientY)
          if (unit) {
            nodeKeyRef.current = unit.key
            setCtrlPos(placeOf(editor, unit.el))
          } else {
            scheduleHide()
          }
        }

        const target = e.target as Node | null
        let foundKey: NodeKey | null = null
        let foundElem: HTMLElement | null = null

        if (target) {
          // $getNearestNodeFromDOMNode calls getActiveEditor() internally, which
          // only resolves inside editor.read()/editor.update() — unlike the
          // other lookups in this file, getEditorState().read() alone isn't
          // enough for it and throws "Unable to find an active editor".
          editor.read(() => {
            const node = $getNearestNodeFromDOMNode(target)
            if (node && $isDecoratorNode(node)) {
              foundKey = node.getKey()
              foundElem = editor.getElementByKey(node.getKey())
            }
          })
        }

        if (!foundKey || !foundElem) {
          deselectBlock()
          return
        }

        selectBlock(foundKey, foundElem)
      }

      root.addEventListener('pointermove', onPointerMove)
      root.addEventListener('pointerleave', onPointerLeave)
      root.addEventListener('pointerdown', onPointerDown)

      rootCleanupRef.current = () => {
        root.removeEventListener('pointermove', onPointerMove)
        root.removeEventListener('pointerleave', onPointerLeave)
        root.removeEventListener('pointerdown', onPointerDown)
      }
    })

    return () => {
      rootCleanupRef.current?.()
      rootCleanupRef.current = null
      unregisterRootListener()
    }
  }, [editor, cancelHide, scheduleHide, deselectBlock, selectBlock])

  // Close action menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  // Delete/Backspace removes the selected (clicked) block, as long as the
  // keystroke isn't actually being typed into an input/textarea/editable
  // field — e.g. a spreadsheet cell or an equation's own text entry.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const key = selectedKeyRef.current
      if (!key) return
      // A circuit's own canvas (React Flow) handles Delete for its selected
      // parts and wires, so the block itself must not be removed by the key.
      if (e.target instanceof Element && e.target.closest('.circuit-block')) return
      // Only real form fields (a spreadsheet cell, etc.) take priority over
      // deleting the selected block — NOT document.activeElement.isContentEditable,
      // which is true for the whole Lexical root and would silently defeat this
      // on every keystroke (the root keeps DOM focus even when a block's own
      // non-editable canvas, like Molecule's SVG, is what was actually clicked).
      const active = document.activeElement as HTMLElement | null
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return

      // Capture phase + stopImmediatePropagation: Lexical's own keydown
      // handling sits on the contentEditable root in the bubble phase, and it
      // still has a stale text selection sitting wherever the caret last was
      // (clicking a block's non-editable canvas never moves Lexical's internal
      // selection). Without cutting the event off before it gets there,
      // Lexical deletes a character from that stale position *in addition to*
      // the block removal below — exactly the "eats my text" bug this caused
      // once already.
      e.preventDefault()
      e.stopImmediatePropagation()
      editor.update(() => {
        $getNodeByKey(key)?.remove()
      })
      deselectBlock()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [editor, deselectBlock])

  // Clear the selection highlight when clicking anywhere outside the editor
  // root (sidebar, toolbar, slash menu, …) — the root's own pointerdown
  // handler above only ever sees clicks inside itself, so without this the
  // highlighted block would stay lit forever once you clicked away.
  useEffect(() => {
    function onDocumentPointerDown(e: PointerEvent) {
      const target = e.target as Element | null
      if (target?.closest?.('.block-controls, .block-action-menu')) return
      const root = editor.getRootElement()
      if (root && !root.contains(e.target as Node)) {
        deselectBlock()
      }
    }
    document.addEventListener('pointerdown', onDocumentPointerDown)
    return () => document.removeEventListener('pointerdown', onDocumentPointerDown)
  }, [editor, deselectBlock])

  const executeAction = useCallback((action: 'delete' | 'duplicate' | 'moveUp' | 'moveDown') => {
    const key = nodeKeyRef.current
    if (!key) return

    editor.update(() => {
      const node = $getNodeByKey(key)
      if (!node) return

      // A list item moves, copies and goes together with the nested list under it.
      const group = $unitNodes(node)
      const last = group[group.length - 1]
      if (action === 'delete') {
        group.forEach(n => n.remove())
        if (selectedKeyRef.current === key) deselectBlock()
      } else if (action === 'moveUp') {
        let prev = node.getPreviousSibling()
        if ($isNestedWrapper(prev)) prev = prev!.getPreviousSibling()
        if (prev) group.forEach(n => prev!.insertBefore(n))
      } else if (action === 'moveDown') {
        const next = last.getNextSibling()
        if (next) {
          const after = $unitNodes(next)
          const end = after[after.length - 1]
          for (let i = group.length - 1; i >= 0; i--) end.insertAfter(group[i])
        }
      } else if (action === 'duplicate') {
        const clones = group.map(n => ($isElementNode(n) ? $deepCloneElement(n) : $cloneNodeShallow(n)))
        for (let i = clones.length - 1; i >= 0; i--) last.insertAfter(clones[i])
        const first = clones[0]
        if ($isElementNode(first)) first.selectEnd()
      }
    })

    setMenuOpen(false)
  }, [editor, deselectBlock])

  const handleAddBelow = useCallback(() => {
    const key = nodeKeyRef.current
    if (!key) return
    editor.update(() => {
      const node = $getNodeByKey(key)
      if (!node) return
      // A list item adds another item to the same list, under any nested list it has; other blocks add a line.
      const group = $unitNodes(node)
      const fresh = $isListItemNode(node) ? $createListItemNode() : $createParagraphNode()
      group[group.length - 1].insertAfter(fresh)
      fresh.selectEnd()
    })
    setCtrlPos(null)
  }, [editor])

  // Moves one block, then lets every block that shifted glide to its new place (FLIP):
  // measure before, let Lexical update the DOM, measure after, and animate the difference.
  const moveBlock = useCallback((movingKeys: NodeKey[], target: { key: NodeKey; position: 'before' | 'after' }, keys: NodeKey[]) => {
    // Moving a block must not scroll the page: Lexical would otherwise
    // scroll the old caret position back into view, which looked like the
    // whole screen jumping. Keep the scroll position exactly as it was.
    const scroller = rootElRef.current?.closest('.editor-area-scroll') as HTMLElement | null
    const top = scroller?.scrollTop ?? 0
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const before = new Map<NodeKey, number>()
    if (!calm) {
      const view = scroller?.getBoundingClientRect()
      for (const k of keys) {
        const r = editor.getElementByKey(k)?.getBoundingClientRect()
        // Only what is on screen (plus a margin) is animated: the rest cannot be seen moving.
        if (r && (!view || (r.bottom > view.top - 160 && r.top < view.bottom + 160))) before.set(k, r.top)
      }
    }
    editor.update(() => {
      const moving = movingKeys.map(k => $getNodeByKey(k)).filter((n): n is LexicalNode => !!n)
      const targetNode = $getNodeByKey(target.key)
      if (!moving.length || !targetNode) return
      if (target.position === 'before') {
        moving.forEach(n => targetNode.insertBefore(n))
      } else {
        for (let i = moving.length - 1; i >= 0; i--) targetNode.insertAfter(moving[i])
      }
    }, {
      tag: 'skip-scroll-into-view',
      onUpdate: () => {
        if (scroller) scroller.scrollTop = top
        before.forEach((oldTop, k) => {
          const el = editor.getElementByKey(k)
          if (!el) return
          const dy = oldTop - el.getBoundingClientRect().top
          if (Math.abs(dy) > 1) {
            el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
          }
        })
        const dropped = editor.getElementByKey(movingKeys[0])
        if (dropped) {
          dropped.classList.add('block-dropped')
          setTimeout(() => dropped.classList.remove('block-dropped'), 900)
        }
      },
    })
  }, [editor])

  // Drag-to-reorder, driven entirely by Pointer Events (not native HTML5
  // drag-and-drop) so the same code path works for mouse, pen, and touch —
  // native `draggable`/dragstart never fires from a touch gesture on
  // mobile browsers. Pointer capture on the handle itself means move/up
  // keep firing on it no matter where the finger/cursor actually is.
  //
  // What makes it feel smooth:
  //  - the drop gap comes from the pointer's height alone (dropSlot), so it never flickers off
  //    in the margins between blocks or beside the page;
  //  - one animation frame does all the work: scroll near an edge, measure, move the line and
  //    the floating preview (no React render per pointer move);
  //  - the dragged block dims, a small preview follows the pointer, the line glides between gaps;
  //  - the page scrolls by itself near the top and bottom edge, so a long document is reachable;
  //  - on drop the blocks that shifted slide into place instead of jumping. Escape cancels.
  const handleDragPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const key = nodeKeyRef.current
    const root = rootElRef.current
    if (!key || !root) return
    e.preventDefault()
    e.stopPropagation()

    // What can be dropped between: the root's blocks, or, for a list item, the items of its own list
    // (each with the nested list under it, which travels with it).
    const blocks: { key: NodeKey; keys: NodeKey[]; els: HTMLElement[] }[] = []
    editor.getEditorState().read(() => {
      const dragged = $getNodeByKey(key)
      const scope = dragged && $isListItemNode(dragged) ? dragged.getParent() : $getRoot()
      for (const child of scope ? scope.getChildren() : []) {
        if ($isNestedWrapper(child)) continue
        const nodes = $unitNodes(child)
        const els = nodes.map(n => editor.getElementByKey(n.getKey())).filter((el): el is HTMLElement => !!el)
        if (els.length) blocks.push({ key: child.getKey(), keys: nodes.map(n => n.getKey()), els })
      }
    })
    const draggedKey: NodeKey = key
    const from = blocks.findIndex(b => b.key === draggedKey)
    if (from < 0) return
    // One box for the block and everything that goes with it.
    const rectOf = (b: { els: HTMLElement[] }) => {
      const rs = b.els.map(el => el.getBoundingClientRect())
      return { top: rs[0].top, bottom: rs[rs.length - 1].bottom, left: rs[0].left, width: rs[0].width }
    }

    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    draggingRef.current = true
    setMenuOpen(false)

    const scroller = root.closest('.editor-area-scroll') as HTMLElement | null
    const startX = e.clientX
    const startY = e.clientY
    const touch = e.pointerType === 'touch'
    let x = startX
    let y = startY
    let moved = false // a plain tap/click (no movement) should open the menu, not "drop"
    let frame = 0

    function tick() {
      frame = requestAnimationFrame(tick)
      const area = scroller?.getBoundingClientRect()
      if (scroller && area) {
        const dy = edgeScrollSpeed(y, area.top, area.bottom)
        if (dy) scroller.scrollTop += dy
      }
      const rects = blocks.map(rectOf)
      const slot = dropSlot(rects, y)
      const line = lineRef.current
      if (line) {
        if (isNoopSlot(slot, from)) {
          line.classList.remove('on')
        } else {
          const ref = rects[Math.min(slot, rects.length - 1)]
          line.style.width = `${ref.width}px`
          line.style.transform = `translate3d(${ref.left}px, ${slotLineY(rects, slot) - 0.5}px, 0)`
          line.classList.add('on')
        }
      }
      const ghost = ghostRef.current
      // A finger would hide the preview, so on touch it rides above it.
      if (ghost) ghost.style.transform = `translate3d(${x + 14}px, ${touch ? y - 64 : y + 14}px, 0)`
    }

    function startDrag() {
      moved = true
      blocks[from].els.forEach(el => el.classList.add('block-dragging'))
      document.body.classList.add('is-block-dragging')
      setGhostLabel(dragLabel(blocks[from].els[0].textContent ?? ''))
      setDragging(true)
      frame = requestAnimationFrame(tick)
    }
    function move(ev: PointerEvent) {
      x = ev.clientX
      y = ev.clientY
      if (!moved && Math.hypot(x - startX, y - startY) > 4) startDrag()
    }
    function cleanup() {
      cancelAnimationFrame(frame)
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', cancelDrag)
      window.removeEventListener('keydown', onKey)
      blocks[from].els.forEach(el => el.classList.remove('block-dragging'))
      document.body.classList.remove('is-block-dragging')
      draggingRef.current = false
      setDragging(false)
    }
    function end() {
      // Measured again here, not taken from the last frame, so a quick release is exact.
      const slot = dropSlot(blocks.map(rectOf), y)
      cleanup()
      if (!moved) return
      // The click event that follows this pointerup would otherwise toggle
      // the actions menu open right after a real drag.
      suppressClickRef.current = true
      if (isNoopSlot(slot, from)) return
      const keys = blocks.flatMap(b => b.keys)
      const lastKeys = blocks[blocks.length - 1].keys
      moveBlock(blocks[from].keys, slot < blocks.length ? { key: blocks[slot].key, position: 'before' } : { key: lastKeys[lastKeys.length - 1], position: 'after' }, keys)
    }
    function cancelDrag() {
      cleanup() // pointercancel: the browser took the gesture over, and no click follows
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      cleanup()
      // Escape comes before the pointerup, and a click still follows it: keep that click from opening the menu.
      if (moved) suppressClickRef.current = true
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', cancelDrag)
    window.addEventListener('keydown', onKey)
  }, [editor, moveBlock])

  if (!ctrlPos && !dragging) return null

  const CTRL_WIDTH = 52  // combined width of both buttons + gap
  const CTRL_GAP = 4
  const ctrlLeft = ctrlPos ? ctrlPos.left - CTRL_WIDTH - CTRL_GAP : 0

  return createPortal(
    <>
      {/* Hover controls: drag handle + add button */}
      {ctrlPos && (
      <div
        className="block-controls"
        style={{ top: ctrlPos.top - 12, left: ctrlLeft }}
        onMouseEnter={cancelHide}
        onMouseLeave={scheduleHide}
      >
        <button
          type="button"
          className="block-ctrl-btn block-ctrl-drag"
          title="Drag to move · Click for options"
          aria-label="Drag to move, or click for block options"
          onPointerDown={handleDragPointerDown}
          onClick={e => {
            e.stopPropagation()
            if (suppressClickRef.current) { suppressClickRef.current = false; return }
            const key = nodeKeyRef.current
            const elem = key ? editor.getElementByKey(key) : null
            if (key && elem) selectBlock(key, elem)
            setMenuOpen(v => !v)
          }}
        >
          <GridDotsIcon />
        </button>
        <button
          type="button"
          className="block-ctrl-btn"
          title="Add block below"
          aria-label="Add block below"
          onPointerDown={e => {
            e.preventDefault()
            e.stopPropagation()
            handleAddBelow()
          }}
        >
          <PlusIcon />
        </button>
      </div>
      )}

      {/* Action dropdown menu */}
      {menuOpen && ctrlPos && (
        <div
          ref={menuRef}
          className="block-action-menu"
          style={{ top: ctrlPos.top - 12 + 32, left: ctrlLeft }}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          <button type="button" className="block-action-item" onClick={() => executeAction('duplicate')}>
            <CopyIcon className="block-action-icon" />
            <span>Duplicate</span>
          </button>

          <div className="block-action-sep" />

          <button type="button" className="block-action-item" onClick={() => executeAction('moveUp')}>
            <ArrowUpIcon className="block-action-icon" />
            <span>Move Up</span>
            <span className="block-action-kbd">Alt+⇧↑</span>
          </button>
          <button type="button" className="block-action-item" onClick={() => executeAction('moveDown')}>
            <ArrowDownIcon className="block-action-icon" />
            <span>Move Down</span>
            <span className="block-action-kbd">Alt+⇧↓</span>
          </button>

          <div className="block-action-sep" />

          <button
            type="button"
            className="block-action-item block-action-danger"
            onClick={() => executeAction('delete')}
          >
            <TrashIcon className="block-action-icon" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {dragging && (
        <>
          <div ref={lineRef} className="block-drop-indicator" aria-hidden="true" />
          <div ref={ghostRef} className="block-drag-ghost" style={{ transform: 'translate3d(-9999px, -9999px, 0)' }} aria-hidden="true">
            <GridDotsIcon />
            <span>{ghostLabel}</span>
          </div>
        </>
      )}
    </>,
    document.body,
  )
}

/* ── Inline SVG icons ─────────────────────────────────────────── */

function GridDotsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <circle cx="3.5" cy="3" r="1.1" />
      <circle cx="8.5" cy="3" r="1.1" />
      <circle cx="3.5" cy="6" r="1.1" />
      <circle cx="8.5" cy="6" r="1.1" />
      <circle cx="3.5" cy="9" r="1.1" />
      <circle cx="8.5" cy="9" r="1.1" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <line x1="6" y1="1.5" x2="6" y2="10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="1.5" y1="6" x2="10.5" y2="6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className={className} aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 9V2a1 1 0 0 1 1-1h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className={className} aria-hidden="true">
      <polyline points="3,8 6.5,4 10,8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className={className} aria-hidden="true">
      <polyline points="3,5 6.5,9 10,5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className={className} aria-hidden="true">
      <polyline points="2,3.5 11,3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M5 3.5V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="3.5" y="4" width="6" height="7" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}
