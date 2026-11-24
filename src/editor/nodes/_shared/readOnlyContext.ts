// True inside the Preview (and HTML export) view: blocks there stay usable as a
// reader would use them (quiz answers, 3D rotate/zoom, diagrams, interactive
// HTML), but they must not switch into their editing UI.
import { createContext, useContext } from 'react'

export const ReadOnlyContext = createContext(false)

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext)
}
