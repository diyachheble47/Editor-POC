# How This Codebase Actually Works (Frontend-Dev Level)

This is the technical walkthrough — what hooks are used, what state lives
where, what triggers a re-render vs. what triggers a Lexical reconcile,
and how data actually moves between files. Read this if you need to
explain the architecture to someone else, not just "what a file is for."

If you want the beginner-friendly analogies instead, that's a separate
ask — this doc assumes you already know React (hooks, state, context,
portals) and just need to see how Lexical fits into that model.

---

## The One Concept Everything Else Depends On

**Lexical is not a React state library you read from.** It's a separate
engine with its own internal document model (`EditorState`, made of
`Node`s) and its own DOM reconciler, completely independent of React's
virtual DOM diffing. `LexicalComposer` creates one `LexicalEditor`
instance and puts it into React Context. Every plugin/component that
calls `useLexicalComposerContext()` gets the **same singleton instance**
back — that's the only thing being shared; it's not Redux-style global
state, it's literally one JS object reference passed through Context.

Two rules that explain almost every "why is it written like that" in
this codebase:

1. **Every function starting with `$` (e.g. `$getSelection`,
   `$createTextNode`, `$getNodeByKey`) can only be called synchronously
   inside `editor.update(fn)` or `editor.read(fn)`.** Call one outside
   that and you get a runtime "Unable to find an active editor" error.
   This is why every mutation in this codebase is wrapped in
   `editor.update(() => { ... })`.
2. **Lexical nodes are immutable per `EditorState` snapshot.** You never
   mutate a node object directly. To change one, you call
   `node.getWritable()` (returns a fresh clone Lexical will swap in when
   the update commits) or a node's own setter method that does that for
   you (e.g. `node.setModel(...)`). You also can't hold a node reference
   across two separate `editor.update()` calls — you re-fetch it by key
   (`$getNodeByKey`) inside each new update, because the "old" reference
   belongs to a now-stale state snapshot.

---

## Entry Point & Shell

### `src/main.tsx`
Standard Vite/React 18 bootstrap. `createRoot(...).render(<StrictMode><App/></StrictMode>)`. Nothing Lexical-related — just hands off to `App`.

### `src/App.tsx`
Pure composition root, no state, no props:
```
.app (flex column, full height)
 ├─ h1.app-title
 └─ div.app-body (flex: 1)
     └─ <Editor />
```
This is where you'd add anything that isn't the editor itself (a header, a save button, etc.) later.

### `src/editor/EditorConfig.ts`
Not a component — a plain exported object, `editorConfig: InitialConfigType`, consumed by `LexicalComposer`. The field that matters most:
```ts
nodes: [HeadingNode, Model3DNode, EquationNode]
```
This is a registry. `ParagraphNode`/`TextNode` are built into Lexical core and don't need listing. Any OTHER node type — including our own — must be in this array, or calling `$createHeadingNode()` / `$createModel3DNode()` / `$createEquationNode()` anywhere in the app throws at runtime. `theme` maps Lexical's internal semantic keys (`paragraph`, `heading.h1`, `heading.h2`) to our own CSS class names — Lexical applies these as `className` on the DOM element it creates for that node type, during its own reconciliation, not via React.

### `src/editor/Editor.tsx`
```tsx
<LexicalComposer initialConfig={editorConfig}>
  <div className="editor-layout">
    <div className="editor-main">
      <div className="editor-shell">
        <RichTextPlugin .../>
        <HistoryPlugin/>
        <OnChangePlugin onChange={handleChange}/>
        <SlashCommandPlugin/>
      </div>
    </div>
    <div className="editor-sidebar">
      <Toolbar/>
      <StreamPlugin/>
    </div>
  </div>
</LexicalComposer>
```
`<LexicalComposer initialConfig={editorConfig}>` is the line that actually calls Lexical's `createEditor(config)` internally and provides it via context. Everything nested inside — **regardless of DOM position** — can call `useLexicalComposerContext()` and get that same editor. That's why `Toolbar` and `StreamPlugin`, visually rendered in a totally separate sidebar `<div>`, still work: React context follows the **React tree**, not the DOM tree.

- `<RichTextPlugin>` — official Lexical plugin. Renders the `contentEditable` prop, and internally wires up all default rich-text behavior (Enter splitting paragraphs, Backspace merging, arrow-key navigation, native `beforeinput` interception) via Lexical's own command system. We didn't write any of that.
- `<HistoryPlugin>` — official; registers `UNDO_COMMAND`/`REDO_COMMAND` handlers and keeps its own internal stack of `EditorState` snapshots.
- `<OnChangePlugin onChange={handleChange}>` — official; internally just does `editor.registerUpdateListener(({editorState}) => onChange(editorState))`. `handleChange` is a plain module-level function (not a hook) — right now its body is a no-op read, but it's the hook point for persistence later.
- `handleChange(editorState)` calls `editorState.read(() => {...})` — you need `.read()` (a read-only lexical context) to call any `$` function on a *specific* past state snapshot, as opposed to `editor.read()` which reads the *current* state.

---

## Slash Command & Toolbar (the two ways to insert a block)

### `src/editor/SlashCommandPlugin.tsx`
- `useState<string | null>(null)` → `queryString`, the text typed after `/`.
- Uses Lexical's official `useBasicTypeaheadTriggerMatch('/', { minLength: 0 })` — returns a matcher function. That matcher, plus our `options` array, get handed to `<LexicalTypeaheadMenuPlugin>` (official). Internally, that component listens for selection/text changes, runs the matcher against text immediately before the caret, and if it matches, computes an anchor DOM position and calls our `menuRenderFn` render-prop.
- `options` is a `useMemo(() => [...], [editor, queryString])` building four `SlashCommandOption` instances — a small class extending Lexical's own `MenuOption` base (required so each option has a stable `.key` the typeahead plugin can track). Filtering by `queryString` is just an array `.filter()` on `.title`.
- Each option's `onSelect` is a closure that calls `editor.update(() => {...})`. Inside: `$getSelection()` then `$isRangeSelection(selection)` — a type-guard, because Lexical selection can be `RangeSelection | NodeSelection | null`, and only `RangeSelection` has `.insertNodes()`. Then either:
  - `$setBlocksType(selection, () => $createHeadingNode('h2'))` — swaps the `ElementNode` type wrapping the selection (paragraph → heading), or
  - `selection.insertNodes([$createModel3DNode()])` / `[$createEquationNode()]` — inserts our custom nodes at the caret.
- `onSelectOption` (a `useCallback`, passed to the typeahead plugin) runs in its **own** `editor.update()`: removes the leftover `/query` text node, calls `selectedOption.onSelect()` (which opens **another**, nested `editor.update()` — Lexical just batches nested updates into the same transaction), then `closeMenu()`.
- Rendering: `menuRenderFn` receives `anchorElementRef` (a DOM node positioned right at the `/`) and uses `createPortal(<ul>...</ul>, anchorElementRef.current)` — the actual `<li>` DOM output is portaled to sit exactly under the cursor, while the component's own React state/hooks stay right here in `SlashCommandPlugin`.

### `src/editor/Toolbar.tsx`
No local state. `insertModel3D`/`insertEquation` both follow:
```ts
editor.update(() => {
  let selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    $getRoot().selectEnd()          // <- the important line
    selection = $getSelection()
  }
  if ($isRangeSelection(selection)) selection.insertNodes([...])
})
```
Why the extra branch: clicking a button **outside** the contentEditable moves DOM focus away from it, so Lexical's tracked selection can be `null`. `$getRoot().selectEnd()` forces a fresh selection at the end of the document before inserting, so the sidebar buttons work even if you never clicked into the editor first.

---

## AI Streaming

### `src/editor/StreamPlugin.tsx`
- `useState('')` → `prompt` (controlled input). `useState(false)` → `isStreaming`.
- `buildMockReply(prompt)` and `chunkText(text, size)` are **pure functions defined outside the component** — they don't touch React or Lexical, so there's no reason for them to be hooks or live inside the component closure.
- `startStreaming()`:
  1. One `editor.update()`: creates an empty `ParagraphNode`, `$getRoot().append(paragraph)`, captures `paragraph.getKey()` into a plain `let paragraphKey` — **not** React state, because nothing about it needs to trigger a re-render; it just needs to survive as a closed-over variable across the `setInterval` callback.
  2. `setInterval(..., 40)`: each tick opens a **new, separate** `editor.update()`, re-fetches the node via `$getNodeByKey(paragraphKey)` (you cannot reuse a node object across update transactions — see the immutability rule at the top), and appends one `$createTextNode(chunk)`.
  3. On exhaustion: `clearInterval` + `setIsStreaming(false)`.
- This is the concrete proof that "streamed text" and "typed text" go through the exact same door — `editor.update()` — nothing about the streaming path bypasses Lexical.

---

## Custom Nodes (`DecoratorNode` pattern)

Both custom blocks follow an identical shape. Understanding one means understanding both.

### `src/editor/nodes/Model3DNode.tsx`
- `class Model3DNode extends DecoratorNode<React.ReactElement>` — the generic parameter is the return type `decorate()` must produce.
- Instance fields `__src`, `__fileName` (double-underscore is just Lexical's own naming convention for node data, not a language feature).
- `static getType()` → `'model3d'`. The tag Lexical uses in serialized JSON and internal routing.
- `static clone(node)` → **required by every Lexical node.** Lexical calls this internally whenever it needs a new version of the node during an update — you never call it yourself. `constructor(src, fileName, key?)`: the optional `key`, when passed, is forwarded to `super(key)`; Lexical supplies it during `clone()` (to preserve node identity across state snapshots) and omits it on fresh creation (Lexical auto-generates a key).
- `exportJSON()` / `static importJSON()` — the serialization contract; what `editor.getEditorState().toJSON()` or copy-paste would use.
- `exportDOM()` / `static importDOM()` — controls copy-to-clipboard-as-HTML and paste-from-HTML. We return a minimal placeholder for export and disable HTML import entirely (`importDOM` returns `null`) — full clipboard interop isn't a POC concern.
- `setModel(src, fileName)` is the **only** way this node's data changes: `this.getWritable()` returns a mutable clone for the current pending update; you set fields on that clone, never on `this` directly.
- `createDOM()` returns a bare empty `<div>` — the real DOM node Lexical inserts into the contentEditable tree for this block. `updateDOM()` returns `false`, meaning "never re-create/patch this div yourself" — correct here because the actual visible content is owned by React via `decorate()`, not by mutating this div's children directly.
- `decorate(editor, config)` returns `<Model3DComponent nodeKey={...} src={...} fileName={...}/>`. Mechanically: `@lexical/react`'s reconciler takes that JSX and mounts it via a React portal **into** the DOM node `createDOM()` produced. This is the literal wire between "a node in Lexical's tree" and "a live, stateful React component" — decorator nodes are the only place this bridge exists.
- `Model3DComponent` — a plain function component (no state of its own beyond the uncontrolled `<input type="file">`). `handleFileChange` reads the picked file via `FileReader.readAsDataURL`; in `.onload`, wraps the write in `editor.update(() => { const node = $getModel3DNodeByKey(nodeKey); node?.setModel(dataUrl, file.name) })` — re-fetching by key again, since the async callback fires after who-knows-how-many other updates may have happened.
- Renders either the empty file-picker state, or `<model-viewer>` (a real Web Component from `@google/model-viewer`, imported purely for its `customElements.define(...)` side effect) inside a `.model3d-viewport` wrapper that uses CSS `aspect-ratio` + absolute positioning — this specific structure exists because giving `<model-viewer>` a fixed pixel height previously caused some models to render cropped; the aspect-ratio box was the fix.

### `src/editor/nodes/EquationNode.tsx`
Same `DecoratorNode` skeleton, one field: `__equation: string`.
- `EquationComponent` has exactly one piece of local state: `useState<boolean>` → `isEditing`.
  - **Editing:** renders `<EquationEditorPanel initialValue={...} onSave={save} onCancel={...}/>` and delegates *everything* to it. This file has zero knowledge of toolbars, validation, or balancing.
  - **Display:** `toKatexSource(equation || DEFAULT_EQUATION)` → `katex.renderToString(...)` → `dangerouslySetInnerHTML`. This is the only unsafe-HTML injection in the app, justified because the string comes from KaTeX's own trusted output, not arbitrary user HTML.
- `save(value)` is the single choke point back into Lexical: `editor.update(() => { const node = $getNodeByKey(nodeKey); if (node instanceof EquationNode) node.setEquation(value) })`, then `setIsEditing(false)`.
- `DEFAULT_EQUATION` is exported so `$createEquationNode()`'s default parameter, the display fallback, and anything else needing "what does an empty equation look like" all read from one place.

---

## `src/editor/EquationEditorPanel.tsx` — the actual equation UI

Deliberately imports **nothing** from `lexical` or `@lexical/react` — only from `./chemistry/*` and `katex`. It could be lifted into a non-Lexical app unchanged. It only talks to the outside world via two props: `onSave(value: string)` and `onCancel()`.

State:
- `draft: string` — the live text.
- `past: string[]`, `future: string[]` — a hand-rolled undo/redo stack, reset fresh every time the panel mounts (i.e., every time you re-enter edit mode).
- `toast: string | null` — transient success/failure message.
- `validation` — the object returned by `validateEquation(draft)`.

Two effects:
```ts
useEffect(() => {
  const t = setTimeout(() => setValidation(validateEquation(draft)), 500)
  return () => clearTimeout(t)
}, [draft])
```
This is **debounced validation** — every keystroke resets the timer via the cleanup function, so `validateEquation` only actually runs 500ms after you stop typing, not on every character. The second effect does the same pattern to auto-clear `toast` after 3000ms.

- `commitChange(newValue)` is the **single choke point** every edit path goes through (typing, toolbar snippet insertion, Clear, a successful Balance) — pushes `draft` onto `past`, clears `future` (the standard "new edit invalidates redo history" rule), sets the new `draft`.
- `insertAtCursor(snippet, cursorBackBy)` reads the native `<input>`'s `.selectionStart`/`.selectionEnd` (an uncontrolled DOM API — not something React state tracks), splices the snippet into `draft`, then uses `requestAnimationFrame(...)` to refocus and reposition the caret **after** React has actually re-rendered the input with the new value (you can't set selection range before the DOM reflects the new text).
- `handleBalance()` calls the pure function `balanceEquation(validation.parsed)`. On success, `formatEquation({...validation.parsed, reactants, products})` turns the structured result back into display text, which goes through `commitChange`. Either way, sets a `toast`.
- `isReaction`, `typeLabel`, `tone` are computed **inline on every render**, not stored in state — correct, because they're 100% derivable from `validation` and storing them would just be a stale-state bug waiting to happen.

---

## `src/editor/chemistry/*` — plain TypeScript, zero React/Lexical

This whole folder is intentionally framework-agnostic. Data flows one direction: raw text in, structured/validated data out.

**`elements.ts`** — a `Set<string>` of ~118 element symbols + `isValidElementSymbol()`. O(1) lookup, nothing more.

**`formula.ts`** — `parseFormula(formula): ElementCounts | null`. Hand-written recursive-descent parser: a private `parseGroup(str, pos)` walks the string character by character, matching 2-letter-then-1-letter element symbol candidates against `elements.ts`, reading trailing digit runs as counts, and recursing into `(...)`/`[...]` groups (multiplying by a trailing digit on the closing bracket). A top-level `.` (hydrate dot, e.g. `CuSO4.5H2O`) is handled by splitting on it first and summing each segment's own scaled counts. Returns `null` on **any** unrecognized token — that `null` is the single signal every caller uses to mean "not real chemistry." `isElectronSymbol()` special-cases the literal string `"e"` (used in redox half-reactions like `e-`) as valid-with-zero-atoms, since it's real notation but not a periodic element.

**`reaction.ts`** — `parseEquation(rawInput): ParsedEquation | null`, the "shape recognizer." Detects an arrow via regex, checking `<=>`/`<->` **before** plain `->` specifically so `<->`'s embedded `->` substring doesn't get mis-matched first. Splits into left/right text, strips an optional bracket-condition suffix right after the arrow (`->[\Delta]`, or a two-bracket above/below form). Each side is split into terms by `splitTerms()` — a manual character scanner tracking paren/bracket depth so it only splits on a literal `" + "` when not nested inside a compound. Each term goes through `parseTerm()`: regex-strips a leading digit (`coefficient`), a trailing `(s|l|g|aq)` (`state`), then a trailing `\^?\d*[+-]+` (`charge`), leaving the bare `formula`. No arrow found → single `parseTerm()` call, classified `'ion'` if it has a charge, else `'formula'`. `findInvalidFormula(equation)` is a **separate pass** — runs every term's `.formula` through `formula.ts`'s `parseFormula()` — kept independent from structural parsing on purpose, so "doesn't parse as a reaction" and "has a fake element" stay two distinguishable failure modes.

**`balance.ts`** — the one file doing real linear algebra; zero chemistry-specific code, it's a generic solver operating on numbers.
- `Frac` — a small class wrapping BigInt numerator/denominator, auto-reducing via `gcdBig()` on every construction. Implements `add/sub/mul/div/negate/isZero`. Using BigInt fractions (not floats) is what avoids `1.9999999` instead of `2`.
- `toRref(matrix: Frac[][])` — in-place Gauss-Jordan elimination (mutates the array by reassigning `matrix[r] = matrix[r].map(...)`), returns which column is the pivot for each row (or `-1`).
- `balanceEquation(equation)`: builds one row per **element**, one column per **compound** (reactants `+count`, products `-count` — "balanced" means every row sums to zero, i.e. the coefficient vector is in the matrix's null space). Runs `toRref` to find free (non-pivot) columns; **bails out unless exactly one exists** (documented POC limitation — covers the vast majority of textbook equations, not multi-degree-of-freedom systems). Fixes that one free variable to `1` (retries with `-1` if that gives negative coefficients), reads pivot values straight off the RREF's free-column entries, then rescales the fraction solution to the smallest integers via LCM-of-denominators then GCD-of-numerators.

**`format.ts`** — the mirror image of `reaction.ts`: `formatEquation(equation): string` walks the same `ParsedEquation` shape **backward** into plain text. Used exactly once, by `EquationEditorPanel.handleBalance()`, to turn the balancer's structured output back into editable text.

**`validate.ts`** — `validateEquation(rawInput): ValidationResult`, the "what message does the user see" policy layer, built entirely on the three files above. `sumElementCounts(terms)` multiplies each term's atom-count map by its `.coefficient` and merges across a side; `countsEqual(a, b)` compares two such maps key-by-key. The whole function is one early-return chain: empty → `'empty'`; parse failure → `'incomplete'`; any bad formula → `'invalid-element'`; no arrow → `'valid-formula'`/`'valid-ion'`; arrow present → sum both sides, compare → `'balanced'` or `'unbalanced'`.

**`toKatex.ts`** — one function, `toKatexSource(rawInput)`: if the trimmed text already starts with `\`, treat it as hand-written LaTeX and pass through; otherwise wrap it in mhchem's `\ce{...}`. This single function is the **entire seam** between our plain-text chemistry input and what KaTeX needs — both `EquationNode`'s display renderer and `EquationEditorPanel`'s live preview import this exact function, so they can never disagree on how source text renders.

---

## `src/model-viewer.d.ts`
Not runtime code — a TypeScript ambient declaration merging `<model-viewer>` into the global `JSX.IntrinsicElements` interface so it type-checks with the specific attributes we use. Deleting it changes nothing at runtime, only whether `Model3DNode.tsx` compiles.

## `src/index.css` / `src/App.css`
One layout detail worth knowing if you touch this: the full-screen layout chain (`.app` → `.app-body` → `.editor-layout` → `.editor-main` → `.editor-shell`) needs **explicit `min-height: 0`** on every flex container in that chain. Browsers default a flex item's minimum height to its own content size, which silently overrides `flex: 1` in a nested chain and makes the page taller than the viewport instead of exactly filling it.

---

## End-to-End: Tracing a Few Real Interactions

**Typing a character:**
native `beforeinput` fires on the contentEditable → Lexical's own internal listener intercepts it → opens its own `editor.update()` → mutates the `EditorState` (extends/creates a `TextNode`) → Lexical's reconciler diffs old vs. new `EditorState` and patches **only the changed DOM** → every `registerUpdateListener` fires afterward (this is what powers `OnChangePlugin` under the hood, and what `LexicalTypeaheadMenuPlugin` uses to check for a trigger match). Note: **most of this involves no React re-render at all** — Lexical has its own DOM reconciler, separate from React's.

**Typing `/` then picking "Equation":**
Same `beforeinput` path as above, but `LexicalTypeaheadMenuPlugin`'s internal listener notices the trigger match and calls its own React state setter → *this* causes a real React re-render, of `SlashCommandPlugin`, which recomputes `options` and portals a menu into the DOM. Clicking a menu `<li>` is a normal React `onClick` → runs `onSelectOption` → `editor.update()` → back into the same reconcile path as typing, except this time inserting an `EquationNode` instead of a text node.

**Lexical rendering that new `EquationNode`:**
the reconciler sees a `DecoratorNode` in the new state it hasn't created DOM for yet → calls `createDOM()` → then `decorate()` is called and its returned JSX is mounted via a React portal **into** that DOM node. You're now back inside a real React subtree (`EquationComponent`) with its own hooks — physically living inside Lexical's contentEditable, logically still part of the same outer React tree (`useLexicalComposerContext()` still works inside it, because Context follows the React tree).

**Editing that equation:**
clicking it flips local `isEditing` state — pure React, Lexical isn't touched at all while you're typing in `EquationEditorPanel`. Only when you click "Done" (`onSave`) does it call back into `editor.update()` and re-enter the Lexical world.
