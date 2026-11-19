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
  $isTextNode,
} from 'lexical'
import type { ElementNode, LexicalNode, NodeKey } from 'lexical'
import { setSelectedBlockKey } from '../blockSelection'

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

interface DropLine {
  top: number    // viewport-relative
  left: number
  width: number
}

export function BlockControlsPlugin() {
  const [editor] = useLexicalComposerContext()
  const [ctrlPos, setCtrlPos] = useState<CtrlPos | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropLine, setDropLine] = useState<DropLine | null>(null)
  const nodeKeyRef = useRef<NodeKey | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuOpenRef = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootCleanupRef = useRef<(() => void) | null>(null)
  const draggedKeyRef = useRef<NodeKey | null>(null)
  const dropTargetRef = useRef<{ key: NodeKey; position: 'before' | 'after' } | null>(null)
  const selectedKeyRef = useRef<NodeKey | null>(null)
  // The highlight lives on the real block element itself (a CSS class), not a
  // separately-positioned overlay — a `position: fixed` box computed once at
  // click time has no way to track the page being scrolled afterward, which
  // is exactly what made it look stuck/detached as the content moved under it.
  const selectedElemRef = useRef<HTMLElement | null>(null)
  const rootElRef = useRef<HTMLElement | null>(null)
  const suppressClickRef = useRef(false)

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
      if (!menuOpenRef.current) {
        setCtrlPos(null)
        nodeKeyRef.current = null
      }
    }, 280)
  }, [cancelHide])

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

        let foundKey: NodeKey | null = null
        editor.getEditorState().read(() => {
          for (const child of $getRoot().getChildren()) {
            if (editor.getElementByKey(child.getKey()) === elem) {
              foundKey = child.getKey()
              break
            }
          }
        })

        if (!foundKey) {
          scheduleHide()
          return
        }

        nodeKeyRef.current = foundKey
        const rect = elem.getBoundingClientRect()
        setCtrlPos({
          top: rect.top + rect.height / 2,
          left: rect.left,
        })
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
          const elem = resolveHoveredBlock(e.target)
          if (elem) {
            let foundKey: NodeKey | null = null
            editor.getEditorState().read(() => {
              for (const child of $getRoot().getChildren()) {
                if (editor.getElementByKey(child.getKey()) === elem) {
                  foundKey = child.getKey()
                  break
                }
              }
            })
            if (foundKey) {
              nodeKeyRef.current = foundKey
              const rect = elem.getBoundingClientRect()
              setCtrlPos({ top: rect.top + rect.height / 2, left: rect.left })
            } else {
              scheduleHide()
            }
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

      if (action === 'delete') {
        node.remove()
        if (selectedKeyRef.current === key) deselectBlock()
      } else if (action === 'moveUp') {
        const prev = node.getPreviousSibling()
        if (prev) prev.insertBefore(node)
      } else if (action === 'moveDown') {
        const next = node.getNextSibling()
        if (next) next.insertAfter(node)
      } else if (action === 'duplicate') {
        const clone = $isElementNode(node)
          ? $deepCloneElement(node)
          : $cloneNodeShallow(node)
        node.insertAfter(clone)
        if ($isElementNode(clone)) clone.selectEnd()
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
      const para = $createParagraphNode()
      node.insertAfter(para)
      para.selectEnd()
    })
    setCtrlPos(null)
  }, [editor])

  const performDrop = useCallback(() => {
    const draggedKey = draggedKeyRef.current
    const target = dropTargetRef.current
    draggedKeyRef.current = null
    dropTargetRef.current = null
    setDropLine(null)
    if (!draggedKey || !target) return
    // Moving a block must not scroll the page: Lexical would otherwise
    // scroll the old caret position back into view, which looked like the
    // whole screen jumping. Keep the scroll position exactly as it was.
    const root = rootElRef.current
    const scroller = root?.closest('.editor-area-scroll') as HTMLElement | null
    const top = scroller?.scrollTop ?? 0
    editor.update(() => {
      const draggedNode = $getNodeByKey(draggedKey)
      const targetNode = $getNodeByKey(target.key)
      if (!draggedNode || !targetNode) return
      if (target.position === 'before') {
        targetNode.insertBefore(draggedNode)
      } else {
        targetNode.insertAfter(draggedNode)
      }
    }, { tag: 'skip-scroll-into-view', onUpdate: () => { if (scroller) scroller.scrollTop = top } })
  }, [editor])

  // Drag-to-reorder, driven entirely by Pointer Events (not native HTML5
  // drag-and-drop) so the same code path works for mouse, pen, and touch —
  // native `draggable`/dragstart never fires from a touch gesture on
  // mobile browsers. Pointer capture on the handle itself means move/up
  // keep firing on it no matter where the finger/cursor actually is, so
  // `document.elementFromPoint` is used to find what's really underneath.
  const handleDragPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const key = nodeKeyRef.current
    if (!key) return
    e.preventDefault()
    e.stopPropagation()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    draggedKeyRef.current = key
    setMenuOpen(false)
    const startX = e.clientX
    const startY = e.clientY
    let moved = false // a plain tap/click (no movement) should open the menu, not "drop"

    function updateDropTarget(clientX: number, clientY: number) {
      const root = rootElRef.current
      if (!root) return
      const elem = resolveBlockElement(root, document.elementFromPoint(clientX, clientY))
      if (!elem) { setDropLine(null); dropTargetRef.current = null; return }

      let targetKey: NodeKey | null = null
      editor.getEditorState().read(() => {
        for (const child of $getRoot().getChildren()) {
          if (editor.getElementByKey(child.getKey()) === elem) {
            targetKey = child.getKey()
            break
          }
        }
      })
      if (!targetKey || targetKey === draggedKeyRef.current) {
        setDropLine(null)
        dropTargetRef.current = null
        return
      }
      const rect = elem.getBoundingClientRect()
      const before = clientY < rect.top + rect.height / 2
      dropTargetRef.current = { key: targetKey, position: before ? 'before' : 'after' }
      setDropLine({ top: before ? rect.top : rect.bottom, left: rect.left, width: rect.width })
    }

    function move(ev: PointerEvent) {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 4) moved = true
      if (moved) updateDropTarget(ev.clientX, ev.clientY)
    }
    function cleanup() {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', cancelDrag)
    }
    function end() {
      cleanup()
      if (moved) {
        // The click event that follows this pointerup would otherwise toggle
        // the actions menu open right after a real drag.
        suppressClickRef.current = true
        performDrop()
      } else {
        draggedKeyRef.current = null
        dropTargetRef.current = null
      }
    }
    function cancelDrag() {
      cleanup()
      draggedKeyRef.current = null
      dropTargetRef.current = null
      setDropLine(null)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', cancelDrag)
  }, [editor, performDrop])

  if (!ctrlPos && !dropLine) return null

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

      {dropLine && (
        <div
          className="block-drop-indicator"
          style={{ top: dropLine.top, left: dropLine.left, width: dropLine.width }}
        />
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
