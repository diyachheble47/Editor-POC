import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  FORMAT_TEXT_COMMAND,
} from 'lexical'
import { $setBlocksType } from '@lexical/selection'
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text'
import { useEditorUI } from '../context/EditorUIContext'
import type { BlockType } from '../context/EditorUIContext'

interface ToolbarPos { top: number; left: number }

const BLOCK_BTNS: { type: BlockType; label: string; title: string }[] = [
  { type: 'paragraph', label: 'P',  title: 'Paragraph' },
  { type: 'h1',        label: 'H1', title: 'Heading 1' },
  { type: 'h2',        label: 'H2', title: 'Heading 2' },
  { type: 'h3',        label: 'H3', title: 'Heading 3' },
  { type: 'quote',     label: '"',  title: 'Quote' },
]

export function FloatingFormatPlugin() {
  const [editor] = useLexicalComposerContext()
  const { isBold, isItalic, isUnderline, isStrikethrough, isCode, blockType } = useEditorUI()
  const [pos, setPos] = useState<ToolbarPos | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          setPos(null)
          return
        }
        const nativeSel = window.getSelection()
        if (!nativeSel || nativeSel.rangeCount === 0) { setPos(null); return }

        const rect = nativeSel.getRangeAt(0).getBoundingClientRect()
        if (rect.width === 0) { setPos(null); return }

        setPos({
          top: rect.top - 50,
          left: rect.left + rect.width / 2,
        })
      })
    })
  }, [editor])

  const applyBlockType = useCallback((type: BlockType) => {
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      // Toggle: clicking the active type reverts to paragraph
      const target: BlockType = blockType === type ? 'paragraph' : type
      if (target === 'paragraph') {
        $setBlocksType(selection, () => $createParagraphNode())
      } else if (target === 'h1' || target === 'h2' || target === 'h3') {
        $setBlocksType(selection, () => $createHeadingNode(target))
      } else if (target === 'quote') {
        $setBlocksType(selection, () => $createQuoteNode())
      }
    })
  }, [editor, blockType])

  if (!pos) return null

  return createPortal(
    <div
      ref={toolbarRef}
      className="floating-format-toolbar"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className={`fft-btn fft-bold${isBold ? ' active' : ''}`}
        title="Bold (⌘B)"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
      >B</button>

      <button
        type="button"
        className={`fft-btn fft-italic${isItalic ? ' active' : ''}`}
        title="Italic (⌘I)"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
      >I</button>

      <button
        type="button"
        className={`fft-btn fft-underline${isUnderline ? ' active' : ''}`}
        title="Underline (⌘U)"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
      >U</button>

      <button
        type="button"
        className={`fft-btn fft-strike${isStrikethrough ? ' active' : ''}`}
        title="Strikethrough"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}
      >S</button>

      <button
        type="button"
        className={`fft-btn fft-code${isCode ? ' active' : ''}`}
        title="Inline code"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')}
      >{"`"}</button>

      <span className="fft-divider" aria-hidden="true" />

      {BLOCK_BTNS.map(({ type, label, title }) => (
        <button
          key={type}
          type="button"
          className={`fft-btn fft-block-btn${blockType === type ? ' active' : ''}`}
          title={title}
          onClick={() => applyBlockType(type)}
        >{label}</button>
      ))}
    </div>,
    document.body,
  )
}
