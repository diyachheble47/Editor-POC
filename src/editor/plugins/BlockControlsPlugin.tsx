import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  $isTextNode,
} from 'lexical'
import type { ElementNode, LexicalNode, NodeKey } from 'lexical'

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

interface CtrlPos {
  top: number   // viewport-relative, center of block
  left: number  // viewport-relative, left edge of block
}

export function BlockControlsPlugin() {
  const [editor] = useLexicalComposerContext()
  const [ctrlPos, setCtrlPos] = useState<CtrlPos | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const nodeKeyRef = useRef<NodeKey | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuOpenRef = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { menuOpenRef.current = menuOpen }, [menuOpen])

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

  // Attach mousemove to the editor root element
  useEffect(() => {
    const root = editor.getRootElement()
    if (!root) return

    function onMouseMove(e: MouseEvent) {
      cancelHide()

      // Walk up from target to find a direct child of the editor root
      let elem = e.target as HTMLElement
      while (elem && elem.parentElement !== root) {
        if (!elem.parentElement) { scheduleHide(); return }
        elem = elem.parentElement as HTMLElement
      }
      if (!elem || elem === root) { scheduleHide(); return }

      // Find which Lexical root-level node corresponds to this DOM element
      let foundKey: NodeKey | null = null
      editor.getEditorState().read(() => {
        for (const child of $getRoot().getChildren()) {
          if (editor.getElementByKey(child.getKey()) === elem) {
            foundKey = child.getKey()
            break
          }
        }
      })

      if (!foundKey) { scheduleHide(); return }

      nodeKeyRef.current = foundKey
      const rect = elem.getBoundingClientRect()
      setCtrlPos({
        top: rect.top + rect.height / 2,
        left: rect.left,
      })
    }

    root.addEventListener('mousemove', onMouseMove)
    root.addEventListener('mouseleave', scheduleHide)
    return () => {
      root.removeEventListener('mousemove', onMouseMove)
      root.removeEventListener('mouseleave', scheduleHide)
    }
  }, [editor, cancelHide, scheduleHide])

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

  const executeAction = useCallback((action: 'delete' | 'duplicate' | 'moveUp' | 'moveDown') => {
    const key = nodeKeyRef.current
    if (!key) return

    editor.update(() => {
      const node = $getNodeByKey(key)
      if (!node) return

      if (action === 'delete') {
        node.remove()
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
  }, [editor])

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

  if (!ctrlPos) return null

  const CTRL_WIDTH = 52  // combined width of both buttons + gap
  const CTRL_GAP = 4
  const ctrlLeft = ctrlPos.left - CTRL_WIDTH - CTRL_GAP

  return createPortal(
    <>
      {/* Hover controls: drag handle + add button */}
      <div
        className="block-controls"
        style={{ top: ctrlPos.top - 12, left: ctrlLeft }}
        onMouseEnter={cancelHide}
        onMouseLeave={scheduleHide}
      >
        <button
          type="button"
          className="block-ctrl-btn"
          title="Block options"
          aria-label="Block options"
          onMouseDown={e => { e.preventDefault(); setMenuOpen(v => !v) }}
        >
          <GridDotsIcon />
        </button>
        <button
          type="button"
          className="block-ctrl-btn"
          title="Add block below"
          aria-label="Add block below"
          onMouseDown={e => { e.preventDefault(); handleAddBelow() }}
        >
          <PlusIcon />
        </button>
      </div>

      {/* Action dropdown menu */}
      {menuOpen && (
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
