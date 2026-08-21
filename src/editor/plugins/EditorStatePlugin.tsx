import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
} from 'lexical'
import type { RangeSelection } from 'lexical'
import { $isHeadingNode, $isQuoteNode } from '@lexical/rich-text'
import { $isListNode } from '@lexical/list'
import { $isCodeNode } from '@lexical/code-core'
import { useEditorUI } from '../context/EditorUIContext'
import type { BlockType } from '../context/EditorUIContext'

function resolveBlockType(selection: RangeSelection): BlockType {
  const anchorNode = selection.anchor.getNode()
  if (anchorNode.getKey() === 'root') return 'paragraph'

  const topLevel = anchorNode.getTopLevelElementOrThrow()
  if ($isHeadingNode(topLevel)) return topLevel.getTag() as BlockType
  if ($isListNode(topLevel)) return topLevel.getListType() === 'bullet' ? 'bullet' : 'number'
  if ($isQuoteNode(topLevel)) return 'quote'
  if ($isCodeNode(topLevel)) return 'code'
  return 'paragraph'
}

export function EditorStatePlugin() {
  const [editor] = useLexicalComposerContext()
  const { update } = useEditorUI()

  useEffect(() => {
    // Expose the editor instance so TopBar can dispatch undo/redo
    update({ editor })

    const unregUndo = editor.registerCommand(
      CAN_UNDO_COMMAND,
      (canUndo) => { update({ canUndo }); return false },
      COMMAND_PRIORITY_LOW,
    )
    const unregRedo = editor.registerCommand(
      CAN_REDO_COMMAND,
      (canRedo) => { update({ canRedo }); return false },
      COMMAND_PRIORITY_LOW,
    )

    const unregUpdate = editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return
        update({
          isBold: selection.hasFormat('bold'),
          isItalic: selection.hasFormat('italic'),
          isUnderline: selection.hasFormat('underline'),
          isStrikethrough: selection.hasFormat('strikethrough'),
          isCode: selection.hasFormat('code'),
          blockType: resolveBlockType(selection),
        })
      })
    })

    return () => {
      unregUndo()
      unregRedo()
      unregUpdate()
    }
  }, [editor, update])

  return null
}
