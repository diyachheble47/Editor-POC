import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { LexicalEditor } from 'lexical'
import type { Model3DAnimationConfig, Model3DDisplayConfig } from '../nodes/model3d/Model3DNode'

// Holds state that changes only on a deliberate user action (opening a
// block's properties, switching the right-panel tab) — not on every
// keystroke. The fast-changing live-formatting state (bold/italic/block
// type/selected text/undo-redo) lives in the sibling EditorFormatContext
// instead, specifically so that components which only ever call this
// context's `update` setter (Model3DViewer, MathNode's MathComponent,
// EditorStatePlugin itself) never re-render just because the user typed a
// character somewhere else in the document — see EditorFormatContext.tsx
// for the full reasoning.

export type MathVariant = 'math' | 'chemistry'

export interface ActiveMath {
  nodeKey: string
  latex: string
  variant: MathVariant
  displayMode: boolean
}

export interface ActiveModel3D {
  nodeKey: string
  modelUrl: string
  fileName: string
  scale: number
  animation: Model3DAnimationConfig
  display: Model3DDisplayConfig
}

export type BlockType =
  | 'paragraph'
  | 'h1' | 'h2' | 'h3'
  | 'quote'
  | 'code'
  | 'bullet'
  | 'number'
  | 'other'

/** The /agent panel. `run` starts a generation as soon as it opens (from the /agent dropdown). */
export interface AgentSession {
  id: number
  run?: { kind: 'workbook' | 'lesson_plan' | 'lesson' | 'edit'; prompt: string; allowEmpty?: boolean; singleBlock?: boolean; sources?: { name: string; text: string }[]; /** The empty line the prompt was on: the result is added right after it. */ anchorKey?: string }
  /** Opened from selected text: the AI edits only these top-level blocks. */
  scope?: { keys: string[]; text: string }
}

interface EditorUIState {
  agent: AgentSession | null
  editor: LexicalEditor | null
  activeMath: ActiveMath | null
  activeModel3d: ActiveModel3D | null
}

interface EditorUIContextValue extends EditorUIState {
  update: (patch: Partial<EditorUIState>) => void
}

const DEFAULTS: EditorUIState = {
  agent: null,
  editor: null,
  activeMath: null,
  activeModel3d: null,
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
