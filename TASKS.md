# Audit Follow-up Tasks

Source: architecture audit (see conversation / `ARCHITECTURE.md`). Worked one at a time, in this order — each task is implemented, verified (typecheck + live check where applicable), and checked off before the next one starts.

## Critical

- [x] **1. Stop silent document data-loss on restore failure** — done, verified live
  File: `src/editor/plugins/InitStreamPlugin.tsx`, `src/context/DocumentContext.tsx`, `src/components/AppLayout.tsx`, `src/App.css`
  Problem: if `editor.parseEditorState(saved)` throws (e.g. a saved doc references a node type that's since been removed/renamed), the catch block deletes the saved state and silently falls back to the hardcoded demo document — the user's real document is gone with no warning.
  Fix: corrupted raw JSON is now backed up to `lexical-doc-state-corrupted-backup` (with timestamp + parse error) instead of being deleted; `DocumentContext` gained `restoreWarning`/`setRestoreWarning`; `AppLayout` renders a dismissible warning banner when a restore fails.
  Verified: injected a corrupted `lexical-doc-state` value (real content safely round-tripped through `sessionStorage` first, confirmed byte-length match before/after), reloaded — banner appeared with the exact parse error, backup key held the full original corrupted JSON + timestamp, dismiss button worked, and restoring the original value brought the real document back intact on reload.

- [x] **2. Decide the multi-document story** — done, verified live
  Files: `src/context/DocumentContext.tsx`, `src/components/LeftSidebar.tsx`, `src/App.tsx`, `src/editor/plugins/AutoSavePlugin.tsx`, `src/editor/plugins/InitStreamPlugin.tsx`, `src/App.css`
  Problem: storage keys (`tnb-doc-meta`, `lexical-doc-state`) were singular/unkeyed — exactly one document. The sidebar's "My Notebook" / "Current document" UI implied multi-doc but there was no list, create, switch, or delete.
  Design chosen: a small `tnb-doc-index` (array of `{id, title, lastSaved, wordCount, seedDemo}`) is the source of truth for the document list; each document's actual editor JSON lives under its own `lexical-doc-state:<id>` key. A one-time `bootstrapIndex()` migrates a pre-existing single document (old flat `tnb-doc-meta`/`lexical-doc-state` keys) into the first index entry instead of orphaning it (builds on Task 1's restore-safety work — same per-doc key scheme is used by the corrupted-backup path too, via `docCorruptedBackupKey(id)`). Only that one migrated/bootstrap document streams the demo content on empty state (`seedDemo` flag); every document created afterward via "+ New document" starts genuinely blank. Switching documents remounts the whole Lexical editor + `EditorUIContext` (`<LexicalComposer key={activeDocId}>` in `App.tsx`) so there's no stale node-key state carried across unrelated documents. `LeftSidebar.tsx` now has a real document list: create (+), switch (click), delete (click-again-to-confirm, hidden when only one document remains).
  Verified: fresh load correctly migrated the existing single document (title/content/3D-model/Excalidraw block all intact, confirmed via `tnb-doc-index` + per-doc storage key in devtools); created a second blank document (no demo stream), typed independent content and a new title into it, switched back to the first document and confirmed it was completely unaffected, switched back to the second and confirmed its content/title persisted; deleted the second document (confirm-click flow) and verified its `lexical-doc-state:<id>` key was removed from localStorage while the first document's was untouched; final reload confirmed a clean single-document state with no stray keys.

## High

- [x] **3. Resolve the three-way math/chemistry block duplication** — done, verified live
  Files: `src/editor/nodes/math/index.ts`
  Problem: "Chemical Equation" (guided parser/balancer) and "Chemistry" (raw `\ce{}` LaTeX) sat side by side in the slash menu with the same icon and no indication they're different editing experiences.
  Decision (user chose relabel over remove): kept both blocks — `EquationNode`'s "Chemical Equation" is unchanged (the guided one). Relabeled `MathNode`'s chemistry variant to "Raw LaTeX Chemistry (advanced)" with a distinct `{}` icon and a description that explicitly points to "Chemical Equation" for the guided experience; removed its overlapping keywords (`chemistry`/`chemical`/`equation`/`reaction`) so a plain search for those terms surfaces the guided block first, not both.
  Verified: slash menu (`/chem`) and the STEM Insert-panel tab both show the two blocks with distinct icons/labels/descriptions; no code/behavior change to either underlying node (no data migration needed, existing documents unaffected).

- [x] **4. Move 3D model storage off localStorage/base64-in-JSON** — done, verified live
  Files: `src/editor/assetStore.ts` (new), `src/editor/nodes/model3d/Model3DViewer.tsx`, `src/editor/nodes/model3d/Model3DNode.tsx`
  Problem: the whole `.glb` lived as a base64 data-URI inside the Lexical JSON, re-serialized to localStorage on every autosave tick; a reasonably large model could blow the ~5-10MB localStorage quota, and the failure was silently swallowed.
  Fix: new `assetStore.ts` wraps a small IndexedDB store (native browser API, no new dependency) with `saveAsset`/`getAsset`/`deleteAsset`. Uploads now write the raw file as a Blob to IndexedDB keyed by the node's existing stable `modelId` (so replacing a model on the same block naturally overwrites its old blob instead of leaking it) and store only a tiny `idb-asset:<id>` reference string in `modelUrl` — the Lexical JSON itself. `Model3DViewer`'s loader resolves that reference to a short-lived `URL.createObjectURL` blob URL at render time (revoked on unmount/change). Backward compatible on purpose: a document saved before this change still has a real `data:` URI in `modelUrl` and loads it directly, unchanged, no forced migration.
  Verified: uploaded a real `.gltf` test file through the actual UI upload flow (not a mock) — confirmed the blob landed in IndexedDB (`teacher-notebook-assets` / `models` store) keyed by `modelId`; confirmed the Lexical node's serialized `modelUrl` is the short `idb-asset:<uuid>` string, not base64 (document JSON stayed ~4.7KB total); confirmed the model actually rendered (reached `ready` state, borderless UI); reloaded the page and confirmed the model re-resolved from IndexedDB and rendered again correctly.
  Known follow-up (not in scope here): no orphan cleanup yet for an asset whose node gets deleted entirely (only the "replace model on the same node" case is covered, via the stable-key overwrite) — flagged for a future pass, not blocking.

## Medium

- [x] **5. Split `EditorUIContext` to stop whole-app re-renders on every keystroke** — done, verified live
  Files: `src/editor/context/EditorFormatContext.tsx` (new), `src/editor/context/EditorUIContext.tsx`, `src/editor/plugins/EditorStatePlugin.tsx`, `src/editor/plugins/FloatingFormatPlugin.tsx`, `src/components/TopBar.tsx`, `src/components/RightPanel.tsx`, `src/App.tsx`
  Problem: one context object was recreated on every editor update (every keystroke/selection move); every `useEditorUI()` consumer anywhere in the tree re-rendered regardless of which fields it read, including components that only ever called the `update` setter and never read state (`Model3DViewer`, `MathNode`'s `MathComponent`, `EditorStatePlugin` itself).
  Fix: split into two contexts along their actual change frequency. New `EditorFormatContext` holds the fast-changing live-formatting state (`isBold/isItalic/isUnderline/isStrikethrough/isCode/blockType/selectedText/canUndo/canRedo`) — every existing `update(...)` call site patched cleanly into either this or the other context, never both, so no call sites needed splitting. `EditorUIContext` now holds only the slow-changing panel state (`editor` ref, `activeMath`, `activeModel3d`, `rightTab`) — set only on deliberate user actions (opening a block's properties, switching tabs), never on every keystroke. `EditorStatePlugin` now calls `update({editor})` once (panel context) and `updateFormat({...})` per selection change (format context) instead of one `update()` for both. `Model3DViewer`/`MathNode` still only consume `EditorUIContext` (for the `update` setter) and are no longer subscribed to the format context at all, so they no longer re-render on every keystroke typed anywhere else in the document.
  Verified: typechecks clean; live-tested floating format toolbar (bold toggle, active-state highlighting, block-type detection), undo/redo via the TopBar buttons and `Ctrl+Z`/`Ctrl+B` keyboard shortcuts, and document creation/typing — all work correctly on a fresh document. (One pre-existing test document's undo stack was independently found to be unresponsive after extensive multi-task manual testing in the same browser tab across Tasks 1-4 — reproduced as unrelated to this change by confirming undo/redo both work correctly on a newly created document in the same session.)

- [x] **6. Stop `OutlinePlugin` re-computing/re-setting on every keystroke** — done, verified live
  File: `src/editor/plugins/OutlinePlugin.tsx`
  Problem: walked all top-level children and called `setOutline()` with a brand-new array on every single editor update (typing anywhere in the document, not just in a heading), giving the sidebar a new array identity to re-render against on every keystroke even when no heading changed.
  Fix: added `outlinesEqual()` structural comparison (length + key/tag/text per item) against a `useRef`-held last-pushed outline; `setOutline()` is now only called when the extracted outline actually differs from what was last pushed.
  Verified: on a fresh document, converted a line to Heading 1 — outline correctly showed it; typed a long unrelated paragraph afterward — outline stayed stable with no flicker/duplication/reset; then edited the heading's own text ("My First Heading" → "My First Heading Edited") — outline correctly updated to the new text, confirming the dedup check suppresses only genuine no-op updates, not real changes.

- [x] **7. Add document schema versioning** — done, needs your verification
  Files: `src/context/DocumentContext.tsx`, `src/editor/plugins/AutoSavePlugin.tsx`, `src/editor/plugins/InitStreamPlugin.tsx`
  Problem: no document-level version field; backward-compat was ad hoc per-node with no central migration strategy, and no way to tell a future code version "this save predates feature X."
  Fix: added `DOC_SCHEMA_VERSION` + `serializeDocState`/`deserializeDocState` to `DocumentContext.tsx`. `AutoSavePlugin` now writes `{ version, state: <lexical editorState.toJSON()> }` instead of the bare Lexical state. `InitStreamPlugin` unwraps the envelope on load via `deserializeDocState`, which also passes through a pre-existing bare (unwrapped) save unchanged — detected by the absence of `version`/`state` keys — so every document saved before this change still loads with no migration step or forced re-save. No migration logic exists yet beyond that pass-through since there's only one version so far; the next schema change adds a `case` in `deserializeDocState` keyed on `version`.
  Needs your verification (not browser-tested by me): open the app, confirm your existing document still loads correctly (it was saved pre-versioning, exercising the pass-through path); type something to trigger an autosave, then check devtools → Application → Local Storage → the `lexical-doc-state:<id>` key — it should now read as `{"version":1,"state":{...}}` instead of the bare Lexical JSON; reload and confirm the document still loads correctly from that new envelope format.

- [x] **8. Decide columns + drag-and-drop scope** — decided: accept and document the limitation
  File: `src/editor/plugins/BlockControlsPlugin.tsx`
  Problem: hover controls / drag-and-drop only consider root-level blocks; content inside a column has no drag support.
  Decision: documented rather than extended. Supporting drag/drop into and across columns is a real feature addition — it needs a decision on cross-container drag semantics (reorder within a column, move between columns, move a block out of a column entirely) and a rewrite of `resolveHoveredBlock`'s root-children-only matching to also resolve column-nested children back to usable coordinates. That's new functionality, not a bug fix, so per the "don't refactor working features without a concrete problem" constraint it's out of scope for this pass. Added an in-code comment at `resolveHoveredBlock` stating the limitation is intentional and what it would take to lift it, so it reads as a documented decision rather than a bug on the next pass. Content inside columns is still fully editable/selectable; it's only the hover drag-handle affordance that doesn't reach it.

## Low

- [x] **9. Delete dead code: `src/editor/nodes/Model3DNode.tsx`** — done
  Confirmed zero importers (`grep -rn "nodes/Model3DNode"` matched nothing outside the live `src/editor/nodes/model3d/` directory) before deleting. Typecheck stayed clean (same two pre-existing, out-of-scope errors as every prior task in this file).

- [ ] **10. Live-verify columns edge cases** — needs your verification, no code change
  Flagged as risks in the audit, not reproduced live yet. Please check in your browser and report back anything that misbehaves so it can be fixed as its own task:
  - Copy a block from inside a column and paste it into another column, and into the main document outside any column
  - Copy a block from the main document and paste it into a column
  - Put a nested list and a code block inside a column cell and confirm they behave normally (editing, indent/outdent, code-block language switch)
  - Undo/redo around Backspace/Delete at a column boundary (e.g. Backspace at the very start of the first cell, Delete at the very end of the last cell) — confirm it doesn't merge/delete the column structure unexpectedly or desync undo history

## Block selection, move and drag (open)

- [ ] **11. Block select + move doesn't work well** — open, not browser-verified
  Files: `src/editor/plugins/BlockControlsPlugin.tsx`, `src/editor/plugins/BlockMovementPlugin.tsx`, `src/editor/blockSelection.ts`
  Current state: clicking a block's ⠿ handle selects it (including plain text blocks) and Alt+Shift+↑/↓ or the handle menu's Move Up/Down should move it. Delete/Backspace removes the selected block. Typecheck and tests pass, but live behaviour was not confirmed and the user reports it still does not work well.
  Next: reproduce in the browser (select via handle, move with Alt+Shift+↑/↓, then via menu), check whether the selection highlight survives a move (Lexical may re-create the DOM element), and check that the selected key still resolves after moves and document switches.

- [ ] **12. Drag-and-drop via ⠿ handle does not reorder in real use** — open
  File: `src/editor/plugins/BlockControlsPlugin.tsx`
  Done so far: removed `preventDefault()` from the handle's `onMouseDown`, which was cancelling the native drag. Native `dragstart` now fires. Reorder logic verified only with synthetic `dragover`/`drop` events.
  Open: the browser tool's drag does not deliver `dragover`/`drop`, so the drop path is unconfirmed. Check whether drops register on the upper/lower half of blocks and whether gaps between blocks leave the drop target unset.
