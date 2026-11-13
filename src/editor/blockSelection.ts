// A tiny cross-plugin singleton for "which block did the user last click to
// select" (BlockControlsPlugin.tsx writes it, BlockMovementPlugin.tsx reads
// it). Deliberately NOT React state / context: nothing here needs to trigger
// a re-render, it's read once, synchronously, inside a keydown handler.
//
// Why this exists: a decorator block (Molecule, Graph, Equation, Matrix,
// Geometry, Spreadsheet, 3D model, …) has no normal Lexical text selection to
// click into — clicking its canvas doesn't move Lexical's RangeSelection
// anywhere. Without a side channel like this, any plugin that only knows
// about $getSelection() (e.g. the Alt+Shift+↑/↓ move shortcut) has no way to
// know a decorator block is "selected", and ends up acting on whatever
// paragraph the text cursor was last sitting in instead — silently
// reordering unrelated content while the user watches a 3D model they just
// clicked do nothing.

import type { NodeKey } from 'lexical'

let selectedBlockKey: NodeKey | null = null

export function getSelectedBlockKey(): NodeKey | null {
  return selectedBlockKey
}

export function setSelectedBlockKey(key: NodeKey | null): void {
  selectedBlockKey = key
}
