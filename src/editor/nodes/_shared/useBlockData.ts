// Shared by the "data on the node" blocks (table, quiz, tabs): the block keeps
// its data in local state while editing (so typing never jumps the caret) and
// writes it to the Lexical node; undo/redo that changes the node mirrors back.
import { $getNodeByKey } from 'lexical'
import type { LexicalNode, NodeKey } from 'lexical'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

export function useBlockData<T>(
  nodeKey: NodeKey,
  initial: T,
  write: (node: LexicalNode, data: T) => void,
  options: { clickToEdit?: boolean } = {},
) {
  const { clickToEdit = true } = options
  const [editor] = useLexicalComposerContext()
  const [data, setData] = useState<T>(initial)
  const [editing, setEditing] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const initialKey = useMemo(() => JSON.stringify(initial), [initial])
  const writeRef = useRef(write)
  writeRef.current = write

  useEffect(() => { setData(prev => (JSON.stringify(prev) === initialKey ? prev : initial)) }, [initialKey, initial])

  useEffect(() => {
    if (!editing) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as globalThis.Node)) setEditing(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [editing])

  const change = useCallback((next: T) => {
    setData(next)
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) writeRef.current(node, next)
    })
  }, [editor, nodeKey])

  return { data, change, editing, setEditing, rootRef, clickToEdit }
}
