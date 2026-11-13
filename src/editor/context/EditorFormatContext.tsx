import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { BlockType } from './EditorUIContext'

// Split out of EditorUIContext on purpose: this holds the state that
// changes on effectively every keystroke/selection move (active text
// formatting, block type, undo/redo availability, selected text). Keeping
// it in the same context as the rarely-changing "which panel/block is
// active" state meant every consumer of that context — including
// components that only ever call the `update` setter and never read
// anything, like Model3DViewer and MathNode's MathComponent — re-rendered
// on every keystroke typed anywhere in the document, because React context
// has no per-field diffing: any Provider value change re-renders every
// consumer regardless of which fields it actually reads.
//
// See EditorUIContext.tsx for the counterpart holding the slow-changing
// state (editor ref, active math/model3d panel target, right-panel tab).

interface EditorFormatState {
  canUndo: boolean
  canRedo: boolean
  isBold: boolean
  isItalic: boolean
  isUnderline: boolean
  isStrikethrough: boolean
  isCode: boolean
  blockType: BlockType
  selectedText: string
}

interface EditorFormatContextValue extends EditorFormatState {
  updateFormat: (patch: Partial<EditorFormatState>) => void
}

const DEFAULTS: EditorFormatState = {
  canUndo: false,
  canRedo: false,
  isBold: false,
  isItalic: false,
  isUnderline: false,
  isStrikethrough: false,
  isCode: false,
  blockType: 'paragraph',
  selectedText: '',
}

const EditorFormatContext = createContext<EditorFormatContextValue>({
  ...DEFAULTS,
  updateFormat: () => {},
})

export function EditorFormatProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EditorFormatState>(DEFAULTS)

  const updateFormat = useCallback((patch: Partial<EditorFormatState>) => {
    setState(prev => ({ ...prev, ...patch }))
  }, [])

  return (
    <EditorFormatContext.Provider value={{ ...state, updateFormat }}>
      {children}
    </EditorFormatContext.Provider>
  )
}

export function useEditorFormat() {
  return useContext(EditorFormatContext)
}
