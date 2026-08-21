import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { LexicalEditor } from 'lexical'

export type BlockType =
  | 'paragraph'
  | 'h1' | 'h2' | 'h3'
  | 'quote'
  | 'code'
  | 'bullet'
  | 'number'
  | 'other'

interface EditorUIState {
  editor: LexicalEditor | null
  canUndo: boolean
  canRedo: boolean
  isBold: boolean
  isItalic: boolean
  isUnderline: boolean
  isStrikethrough: boolean
  isCode: boolean
  blockType: BlockType
}

interface EditorUIContextValue extends EditorUIState {
  update: (patch: Partial<EditorUIState>) => void
}

const DEFAULTS: EditorUIState = {
  editor: null,
  canUndo: false,
  canRedo: false,
  isBold: false,
  isItalic: false,
  isUnderline: false,
  isStrikethrough: false,
  isCode: false,
  blockType: 'paragraph',
}

const EditorUIContext = createContext<EditorUIContextValue>({
  ...DEFAULTS,
  update: () => {},
})

export function EditorUIProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EditorUIState>(DEFAULTS)

  const update = useCallback((patch: Partial<EditorUIState>) => {
    setState(prev => ({ ...prev, ...patch }))
  }, [])

  return (
    <EditorUIContext.Provider value={{ ...state, update }}>
      {children}
    </EditorUIContext.Provider>
  )
}

export function useEditorUI() {
  return useContext(EditorUIContext)
}
