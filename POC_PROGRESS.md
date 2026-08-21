# Lexical Editor POC — Progress Log

This file tracks what has been built so far, in plain language. Each
milestone explains **what** we added, **why** we added it, and **how it
connects to Lexical**.

---

## Step 0: Project Setup (how this project was created)

If you're new to this — here is exactly what was run to create this
project, in order, and why each step was needed.

### Step 1: Create a blank React + TypeScript project

```bash
npm create vite@latest . -- --template react-ts
npm install
```

**What this does:** [Vite](https://vite.dev) is just a tool that creates a
basic web project skeleton and runs a fast local dev server. This step has
**nothing to do with Lexical yet** — it's just an empty React app. Think
of it as pouring the foundation slab before building anything on top.

### Step 2: Install Lexical

```bash
npm install lexical @lexical/react
```

**What this does:** This downloads the actual Lexical library.

- `lexical` — the core engine (Editor, EditorState, Nodes, Commands).
  Framework-agnostic — it doesn't know about React at all.
- `@lexical/react` — official React components/hooks that connect
  Lexical's core engine to a React app (e.g. `LexicalComposer`,
  `RichTextPlugin`). We use these instead of writing our own
  React-to-Lexical wiring.

Later, when we need heading blocks, we also ran:

```bash
npm install @lexical/rich-text
```

(This package ships the `HeadingNode` and related rich-text nodes.)

### Step 3: Run the project locally

```bash
npm run dev
```

**What this does:** starts a local web server (usually at
`http://localhost:5173`). Open that address in your browser to see and
use the editor. Leave this command running in a terminal — every time you
save a code file, the browser refreshes automatically.

That's the entire setup. Everything from here on is *writing code that
uses Lexical*, not installing new tools.

---

## Milestone 1: Basic Lexical Editor

### What we added

A working text editor in the browser. You can click into it and type, and
it behaves like a normal rich text box (supports undo/redo with Ctrl+Z /
Ctrl+Y).

### Why we added it

Before adding any fancy features (blocks, slash commands, 3D models,
equations, AI streaming), we need to prove the actual foundation works:
Lexical is running the editor, not some custom text box.

### How Lexical is involved

This is 100% Lexical — there's no custom editor logic at all yet.

- **`LexicalComposer`** — this is the component that creates the real
  Lexical `Editor` instance. Everything inside it can talk to that one
  editor.
- **`initialConfig`** (in `EditorConfig.ts`) — tells Lexical which node
  types are allowed to exist in the document (right now: the built-in
  `ParagraphNode`/`TextNode`, plus `HeadingNode` which we opted into).
- **`RichTextPlugin`** — a plugin Lexical ships out of the box. It wires
  up the actual editable area (`ContentEditable`) and handles normal
  typing, selection, and formatting behavior so we don't have to write any
  of that ourselves.
- **`HistoryPlugin`** — another built-in plugin. It gives us undo/redo for
  free by tracking a history of `EditorState` snapshots.
- **`OnChangePlugin`** — lets us hook into Lexical's update cycle. Every
  time the document changes, Lexical creates a new **`EditorState`**
  (an immutable snapshot of the whole document, made of **Nodes**), and
  passes it to our `handleChange` function. This is the same mechanism
  we'll later use to insert streamed AI text and custom blocks.

In short: typing in the box is being turned into Lexical `Node`s
(`ParagraphNode` containing `TextNode`s) inside a Lexical `EditorState` —
not just raw HTML that we're managing ourselves.

### Files Changed

- `src/editor/EditorConfig.ts` — the Lexical `initialConfig`: registers
  node types (`HeadingNode`), sets an error handler, and defines CSS class
  names for Lexical's theming system.
- `src/editor/Editor.tsx` — sets up `LexicalComposer` and the core
  plugins (`RichTextPlugin`, `HistoryPlugin`, `OnChangePlugin`). This is
  the file that proves "Lexical is the foundation."
- `src/App.tsx` — simplified to just render the `<Editor />` (removed the
  default Vite/React starter page).
- `src/App.css`, `src/index.css` — minimal styling for the editor box;
  removed the default Vite template styling.

### Verified

Ran the dev server (`npm run dev`) and typed text into the editor in a
real browser — text appears and the cursor behaves normally, confirming
Lexical's `RichTextPlugin` is handling input correctly.

---

---

## Milestone 2: Block Switching + Slash Command Menu

### What we added

Two things:

1. You can now change what kind of block a line of text is. For example,
   typing `/heading` and picking "Heading" turns the current paragraph
   into a heading.
2. A small floating menu that pops up when you type `/` — just like
   Notion. Right now it offers **Text** and **Heading**. Typing more
   after the `/` (e.g. `/head`) filters the list live.

### Why we added it

This is the core of "block-based editing" — proving that a block (a
paragraph, a heading, later a 3D model or equation) is a distinct type of
thing in the document, and that we can swap one block type for another.
The slash command is the main way the user will create new blocks
throughout the rest of this POC.

### How Lexical is involved

- **`$setBlocksType`** (from `@lexical/selection`) — this is a Lexical
  utility function. Give it the current selection and a function that
  creates a new node, and it replaces the block(s) the selection is in
  with that new node type. We use it to turn a `ParagraphNode` into a
  `HeadingNode` and back. We are not manually deleting/recreating DOM
  elements — Lexical handles that once the node tree changes.
- **`LexicalTypeaheadMenuPlugin`** (from `@lexical/react`) — an official
  Lexical plugin built exactly for "detect a trigger character, show a
  floating menu, let the user pick an option." We didn't write our own
  logic to detect when the user types `/` — Lexical's plugin does that
  and tells us where to render our menu.
- **`editor.update()`** — every time a menu option is chosen, we call
  `editor.update()` to make a change. This is the standard way any code
  (not just user typing) is allowed to modify a Lexical `EditorState`.
  Every update produces a new state, same as typing does.

In short: the slash menu is Lexical's official pattern for trigger-based
popups, and picking an option changes the document by swapping Lexical
node types — not by manipulating HTML directly.

### Files Changed

- `src/editor/SlashCommandPlugin.tsx` — new file. Defines the slash menu
  options (Text, Heading) and what each one does to the document.
- `src/editor/Editor.tsx` — added `<SlashCommandPlugin />` alongside the
  other plugins.
- `src/App.css` — added styling for the floating slash menu (`.slash-menu`).

### Verified

In the browser: typed `/`, saw the menu appear; typed `/head`, saw it
filter down to just "Heading"; clicked it, and the current block turned
into a heading (the `/head` text was removed and replaced by the new
block).

### Update: Notion-style menu look

Initially the slash menu was a plain list of text labels. Since the goal
is a Notion-like feel, each option now has an icon, a title, and a short
description, and the menu has a "BASIC BLOCKS" section header — matching
how Notion's `/` menu looks. This is a UI-only change: the Lexical parts
underneath (`LexicalTypeaheadMenuPlugin`, `$setBlocksType`) are unchanged.

- `src/editor/SlashCommandPlugin.tsx` — each option now carries an
  `icon` and `description`, and the menu is rendered as a card with an
  icon box + title/description per row instead of a plain list.
- `src/App.css` — restyled `.slash-menu` to look like Notion's popup
  (section heading, icon boxes, title/description layout).

---

## Milestone 3: `Model3DNode` (3D Model Block)

### What we added

A new "3D Model" option in the `/` menu. Picking it inserts a block that
lets you choose a `.glb` file from your computer and shows the 3D model
right there in the document — you can rotate it by dragging.

### Why we added it

To prove that content beyond text and headings — a full interactive 3D
viewer — can live as a first-class block inside a Lexical document, using
the same document-tree model as everything else.

### How Lexical is involved

- **`Model3DNode extends DecoratorNode`** — `DecoratorNode` is a special
  Lexical node type built for exactly this situation: content that isn't
  plain text and needs custom rendering. The node itself only stores
  plain data — `__src` (the model file, as a base64 string) and
  `__fileName`. Lexical treats it like any other node in the document
  tree (it can be selected, undone/redone, etc.).
- **`decorate()`** — this is the method that makes `DecoratorNode`
  special. Instead of Lexical drawing the content itself, it hands off to
  a React component (`Model3DComponent`) to render whatever it wants.
  That's how a real interactive 3D viewer (`<model-viewer>`) can exist
  inside the editor.
- **`exportJSON` / `importJSON`** — these define how the node converts
  to/from plain JSON. This means the 3D model (including its file data)
  is part of the document's serialized state, not something stored
  separately outside Lexical.
- **`editor.update()`** — when you choose a file, we read it and then
  call `editor.update()` to save that data onto the node
  (`node.setModel(...)`). Same update mechanism as every other change in
  this app.

For the actual 3D rendering, we use `<model-viewer>`, a small
ready-made web component from Google (`@google/model-viewer`) — it just
needs a `src` pointing at the model file. We didn't build any 3D/WebGL
code ourselves; Lexical's job here is only to hold the node in the
document, not to render 3D graphics.

### Files Changed

- `src/editor/nodes/Model3DNode.tsx` — new file. The `Model3DNode` class
  and the `Model3DComponent` React component (file picker + `<model-viewer>`).
- `src/editor/EditorConfig.ts` — registered `Model3DNode` in the `nodes`
  list so Lexical is allowed to create it.
- `src/editor/SlashCommandPlugin.tsx` — added the "3D Model" option.
- `src/model-viewer.d.ts` — new file. Tells TypeScript that
  `<model-viewer>` is a valid HTML tag (it's a plain Web Component, not a
  React component, so TypeScript doesn't know about it by default).
- `src/App.css` — styling for the 3D model block.

### Verified

In the browser: typed `/3d`, menu filtered to "3D Model"; selected it and
saw the empty state with a file chooser; confirmed the block is a real
Lexical node sitting inside the document alongside text.

---

## Milestone 4: `EquationNode` (Chemistry Equation Block)

### What we added

An "Equation" option in the `/` menu. Picking it inserts a block you can
click to type a chemistry equation into (e.g. `2H2 + O2 → 2H2O`), styled
a bit like real equation text.

### Why we added it

Same reasoning as the 3D model: prove that a chemistry equation is a real
piece of document structure (a Lexical node), not just some text string
rendered separately from the editor.

### How Lexical is involved

- **`EquationNode extends DecoratorNode`** — same pattern as
  `Model3DNode` ([[Model3DNode]]-style). It stores one piece of data,
  `__equation` (a plain string), inside the Lexical document tree.
- **`decorate()`** — hands rendering off to `EquationComponent`, a small
  React component that either shows the equation as styled text, or (when
  clicked) an `<input>` to edit it.
- **`setEquation()` + `editor.update()`** — when you finish editing (blur
  or press Enter), we call `editor.update()` and run `node.setEquation()`
  to save the new text into the Lexical node. Lexical then re-renders
  that block with the new value.
- **`exportJSON` / `importJSON`** — again, this makes the equation part
  of the document's real serialized state.

We deliberately kept this node simpler than `Model3DNode` — no file
handling needed, just a string — to show that a custom Lexical node can
be as small as "one string + how to display/edit it."

### Files Changed

- `src/editor/nodes/EquationNode.tsx` — new file. The `EquationNode`
  class and `EquationComponent` (click-to-edit text block).
- `src/editor/EditorConfig.ts` — registered `EquationNode`.
- `src/editor/SlashCommandPlugin.tsx` — added the "Equation" option.
- `src/App.css` — styling for the equation block and its edit input.

### Verified

In the browser: typed `/equation`, menu filtered correctly; selected it,
saw a "Click to write an equation" placeholder block; clicked it, typed
`2H2 + O2 → 2H2O`, pressed Enter, and the block updated to show the
equation as styled text.

---

## Milestone 5: AI Text Streaming

### What we added

A "Stream AI Text" button above the editor. Clicking it starts a fake AI
response typing itself out into a new paragraph, piece by piece — like
watching ChatGPT respond.

### Why we added it

To prove that streamed text (whether it's a mocked response like here, or
a real AI API later) gets inserted into the document **through Lexical**,
not by some separate React `<div>` showing the streamed text and then
dumping it into the editor once fully done. The text is really part of
the Lexical document the entire time it's streaming.

### How Lexical is involved

The flow is exactly: **stream → Lexical update → text appears.**

- We split a mocked response string into small chunks (simulating an AI
  API sending text piece by piece).
- On click, we first call **`editor.update()`** once to create a new,
  empty `ParagraphNode` at the end of the document (using
  `$getRoot().append(...)`, both plain Lexical functions).
- Then, on a timer, every chunk gets added with **another
  `editor.update()`** call: we look up that same paragraph with
  `$getNodeByKey()` and call `paragraph.append($createTextNode(chunk))`.
- Each of these updates produces a new Lexical `EditorState`, and Lexical
  re-renders the paragraph with the extra text — so it visually appears
  to "type itself" chunk by chunk, in real time, inside the actual
  editor.

There is no separate variable in React holding "the streamed text so
far" — the Lexical document itself is that state, updated incrementally.
This is the same `editor.update()` mechanism used for normal typing, the
slash menu, and inserting the 3D model / equation blocks.

For this POC the "stream" is just a mocked string, not a real AI API —
swapping the mock generator for a real streaming fetch call later would
not change how it talks to Lexical at all, since Lexical doesn't care
where the text chunks come from.

### Files Changed

- `src/editor/StreamPlugin.tsx` — new file. Splits a mocked response into
  chunks and streams them into a new paragraph via `editor.update()`,
  with a button to trigger it.
- `src/editor/Editor.tsx` — added `<StreamPlugin />`.
- `src/App.css` — styling for the "Stream AI Text" button.

### Verified

In the browser: clicked "Stream AI Text" and watched the sentence type
itself into the editor progressively, a few characters at a time, until
the full mocked response appeared; button was disabled and showed
"Streaming..." while in progress.

---

## Refinements After Initial Feedback

Three things were improved based on trying the app out:

### 1. Streaming now responds to what you type

Before, "Stream AI Text" always streamed the exact same canned sentence.
Now there's a small input box above the editor — you type a prompt (e.g.
"photosynthesis"), and the streamed text references what you typed. It's
still a **mocked** reply (no real AI API, per the POC scope), but it's
driven by your input instead of a hardcoded string.

- **How Lexical is involved:** unchanged from Milestone 5 — still
  `editor.update()` appending chunks to a paragraph. Only the *content*
  being streamed changed (built from your prompt instead of a fixed
  string), not how it reaches the document.
- File changed: `src/editor/StreamPlugin.tsx` (added the prompt input
  and `buildMockReply()`), `src/App.css` (`.stream-bar` styling).

### 2. Fixed the 3D model getting cropped

After uploading a `.glb`, the bottom of the model was getting cut off.
This happened because the 3D viewer was squeezed into a short, fixed
320px-tall box — not enough room for `<model-viewer>` to fit the whole
model in frame.

**Fix:** the model now sits in a responsive box that keeps a fixed aspect
ratio (4:3) instead of a fixed pixel height, and we reset the camera
framing (`camera-orbit="0deg 75deg 105%"`) so `<model-viewer>`'s built-in
auto-framing has room to fit the entire model, not just part of it.

- File changed: `src/editor/nodes/Model3DNode.tsx`, `src/App.css`
  (`.model3d-viewport`).

**Note on file formats:** 3D models on the web really only have one
native standard — **glTF/.glb** (it's often called "the JPEG of 3D").
Supporting other formats (`.obj`, `.fbx`, `.stl`, etc.) would need a
file-conversion step/pipeline, which the POC scope explicitly excludes
("no model processing pipelines"). So `.glb`/`.gltf` stays the supported
format — this is a real constraint, not something left unfinished.

### 3. Equations now use real chemistry notation, not plain text

The original equation block just displayed whatever plain text you
typed (`2H2 + O2 -> 2H2O`) styled with a serif font — it didn't actually
typeset subscripts, arrows, or charges properly, so it broke down for
anything more advanced (equilibrium reactions, ion charges, reaction
conditions over the arrow, etc.).

**Fix:** the equation block now renders through **KaTeX** with its
**mhchem** extension — a well-established, ready-made library made
specifically for typesetting chemistry equations. You type standard
chemistry notation like:

```
\ce{2H2 + O2 -> 2H2O}
\ce{Fe^2+ <=> Fe^3+ + e-}
\ce{CuSO4 . 5H2O ->[\Delta] CuSO4 + 5H2O}
```

and it displays with real subscripts, superscript charges, arrows
(including equilibrium `<=>` and arrows with conditions written above
them), water-of-crystallization dots, and more. Plain math like `x^2 +
y_2` also works, since KaTeX is a general math typesetter.

- **How Lexical is involved:** unchanged — `EquationNode` still just
  stores one plain string (the KaTeX/mhchem source) inside the Lexical
  document tree via `DecoratorNode`, exactly as before. The only change
  is *what renders that string*: instead of showing the raw text, we now
  call `katex.renderToString(...)` and display the typeset result. The
  node's data, and how it's saved/loaded via `editor.update()` and
  `exportJSON`/`importJSON`, are exactly the same as Milestone 4.
- Files changed: `src/editor/nodes/EquationNode.tsx` (now uses `katex`
  + `katex/contrib/mhchem`), `src/App.css` (equation block/editor
  styling), `package.json` (added `katex` dependency).

### Verified

- Streaming: typed "photosynthesis" into the new prompt box, clicked
  "Generate & Stream", watched a reply mentioning "photosynthesis"
  stream in progressively.
- Equation: edited a block to `\ce{Fe^2+ <=> Fe^3+ + e-}` and confirmed
  it rendered with a real equilibrium arrow and superscript charges,
  not plain text.
- 3D model: applied the aspect-ratio/camera-framing fix; the underlying
  CSS pattern (`aspect-ratio` container + resetting `camera-orbit`) is
  the standard fix for this exact `<model-viewer>` cropping issue.

---

## Making Each Feature Easier to Find and Use

After trying the app, the feedback was: it wasn't obvious *how* to use
the 3D model / equation features (relying only on typing `/` felt
hidden), and typing a chemistry equation directly as regular paragraph
text (instead of inside an equation block) understandably did nothing.

### 1. Added a visible toolbar — no more guessing the slash command

There's now a small toolbar above the editor with its own buttons:
**"🧊 Insert 3D Model"** and **"⚗️ Insert Equation"** — similar to how
the streaming feature already had its own input + button. Typing `/`
still works too; the toolbar is just a second, more discoverable way to
trigger the exact same action.

- **How Lexical is involved:** clicking a toolbar button runs the exact
  same code path as picking that option from the slash menu —
  `editor.update()` followed by `selection.insertNodes([...])`. The
  toolbar and the slash menu are two different pieces of UI triggering
  the same underlying Lexical update; neither one is "more real" than
  the other.
- One real bug fixed along the way: the node (e.g.
  `$createEquationNode()`) must be created **inside** the
  `editor.update()` callback, not before it — every Lexical function
  that starts with `$` only works while an update is actively running.
  The first version of the toolbar created the node too early and
  silently failed; moving that line inside `editor.update()` fixed it.
- File added: `src/editor/Toolbar.tsx`. File changed:
  `src/editor/Editor.tsx` (renders `<Toolbar />`), `src/App.css`
  (`.toolbar` styling).

### 2. Equations: no more LaTeX syntax needed, plus a live preview

Previously you had to know `\ce{...}` syntax to write an equation. Now
you just type it in plain language — `2H2 + O2 -> 2H2O` — and we
automatically wrap it in the right syntax behind the scenes before
handing it to KaTeX. If you already know LaTeX and want full control,
starting your text with a backslash skips the auto-wrapping.

On top of that, while you're editing, a **live preview** appears right
below the input and updates on every keystroke — so you see the real
typeset equation forming as you type, instead of only finding out if it
worked after pressing Enter.

- **How Lexical is involved:** still unchanged at the core —
  `EquationNode` stores one plain string in the Lexical document tree,
  same as before. What changed is a small helper, `toKatexSource()`,
  that decides whether to wrap your plain text in `\ce{...}` before
  showing it to KaTeX. This runs purely at render time (for both the
  saved block and the live preview) — the node itself still only stores
  exactly what you typed.
- Files changed: `src/editor/nodes/EquationNode.tsx` (added
  `toKatexSource()`, live preview, plain-text default), `src/App.css`
  (`.equation-preview` styling).

### Verified

- Clicked "Insert Equation" from the toolbar (without typing `/` at
  all) — a block appeared showing `2H2 + O2 ⟶ 2H2O` properly typeset.
- Clicked into it, replaced the text with plain `Fe^2+ <=> Fe^3+ + e-`
  — watched the live preview update in real time to show a proper
  equilibrium arrow and superscript charges, with no LaTeX knowledge
  needed.
- Clicked "Insert 3D Model" from the toolbar and confirmed the file
  picker block appears the same way as via `/3d`.

---

## Chemical Equation Editor — Upgraded to a Real Chemistry Tool

The next ask was: turn the equation block into a genuinely professional
chemistry-aware editor (usable for a real classroom — reactions,
balancing, ionic equations, states of matter, reaction conditions), not
just plain text passed to KaTeX. This is the biggest single upgrade in
the project so far, so here's what's new in some detail.

### What we added

- A real **toolbar** inside the equation editor: subscript, superscript,
  charge, reaction arrow (→), equilibrium arrow (⇌), plus sign,
  parentheses, state-of-matter buttons `(s) (l) (g) (aq)`, a
  heat/condition button (Δ), and Undo / Redo / Clear.
- **Smart parsing**: typing `H2SO4`, `Ca(OH)2`, `SO4^2-`, `NH4+`, or a
  full reaction like `2Na(s) + 2H2O(l) -> 2NaOH(aq) + H2(g)` is now
  understood structurally, not just displayed as text.
- **Automatic type detection**: the editor recognizes whether what you
  typed is a plain Formula, an Ion, a Reaction, or an Equilibrium
  Reaction, and shows a small badge for it.
- **Validation with clear messages** (debounced — it waits until you
  pause typing, so it doesn't nag you mid-keystroke): "Valid chemical
  formula", "Equation is valid but not balanced.", "Equation is
  balanced.", or `"XYZ" isn't a recognized chemical formula.`
- **A real "Balance Equation" button.** Typing `Fe + O2 -> Fe2O3` and
  clicking it produces `4Fe + 3O2 -> 2Fe2O3` — using an actual
  balancing algorithm, not a lookup table.
- **Cancel preserves your original equation** — if you open an existing
  equation, mess with it, maybe balance it, and then click Cancel, all
  of that is thrown away and the equation stays exactly as it was
  before you opened the editor.

### Why we added it

The plain-text-only version worked for simple cases but broke down
for anything a real chemistry class needs: ions with charges, states of
matter, reaction conditions, and — most importantly — actually balancing
equations, which was the single most-requested capability.

### How this is built (architecture)

This follows the same separation of concerns the whole POC has used from
the start — Lexical only ever stores one plain string; everything
chemistry-related is separate, plain TypeScript that Lexical knows
nothing about:

```
src/editor/chemistry/
  elements.ts   — the list of real element symbols, used to reject "XYZ"
  formula.ts    — parses a single formula ("Ca(OH)2") into atom counts
  reaction.ts   — parses a full equation into { type, reactants, products }
  balance.ts    — the actual balancing algorithm (see below)
  format.ts     — turns balanced structured data back into plain text
  validate.ts   — turns a parsed equation into one status + message
  toKatex.ts    — the one bridge to the renderer (wraps text in \ce{...})
```

- **How Lexical is involved:** exactly as much as before, and no more —
  `EquationNode` still stores a single plain string in the Lexical
  document tree via `DecoratorNode`, saved and loaded through
  `editor.update()` / `exportJSON()` / `importJSON()`. None of the
  chemistry logic above touches Lexical at all; it's plain functions that
  take a string and return data. `EquationNode` just calls them and
  displays the result. This means the entire chemistry engine could be
  tested, reused, or swapped out without Lexical ever being involved —
  which is exactly why it's organized as its own folder.

### The balancing algorithm (the one genuinely custom piece)

Per the "prefer existing standards" guidance: mhchem (used for
rendering) is a *notation* standard — it has no concept of balancing.
There's no equivalent small, standard JS library for balancing chemical
equations, so this one piece is real custom math: the classic
linear-algebra method taught for this exact problem —

1. Each compound's coefficient is treated as an unknown.
2. One equation is written per element: "total atoms of this element on
   the left must equal the total on the right."
3. That's a system of linear equations — solved using exact fraction
   arithmetic (via BigInt, so there's no floating-point rounding error
   like `1.9999999` instead of `2`).
4. The solution is scaled to the smallest whole-number coefficients.

This was tested directly (outside the browser) against several real
equations, including a non-trivial redox reaction:

```
Fe + O2 -> Fe2O3            =>  4Fe + 3O2 -> 2Fe2O3
H2 + O2 -> H2O               =>  2H2 + O2 -> 2H2O
N2 + H2 -> NH3                =>  N2 + 3H2 -> 2NH3
KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2
                              =>  2KMnO4 + 16HCl -> 2KCl + 2MnCl2 + 8H2O + 5Cl2
```

All four came out correctly balanced. (Known POC limitation, documented
in the code: the balancer handles the common case of a reaction with
exactly one "degree of freedom" — true for the vast majority of
textbook equations — and reports "could not automatically balance" for
rarer systems that need more advanced handling.)

### What we deliberately did not build

The original ask described this living inside a full "Presentation
Portal" — slides, drag/resize/duplicate/align presentation objects,
save/reopen persistence across a whole presentation app. That
infrastructure doesn't exist in this project (this is the small Lexical
editor POC), so per the "don't over-engineer / ask before expanding
scope" ground rules for this project, that part was intentionally left
out. The equation instead stays what it's been all along: a block inside
the Lexical document — which already gives it the practical equivalent
of those requirements in a text-editor context (it's an element in the
document you can edit, delete, and reorder by editing around it).

### Files Changed

- `src/editor/chemistry/elements.ts`, `formula.ts`, `reaction.ts`,
  `balance.ts`, `format.ts`, `validate.ts`, `toKatex.ts` — new chemistry
  engine, described above.
- `src/editor/EquationEditorPanel.tsx` — new file. The actual editor UI:
  toolbar, live preview, input, type badge, validation message, balance
  button, undo/redo, cancel/done.
- `src/editor/nodes/EquationNode.tsx` — simplified to just render
  `EquationEditorPanel` in edit mode; no chemistry logic lives here
  anymore.
- `src/App.css` — toolbar/status/toast styling for the new panel.

### Verified

- Toolbar buttons insert correctly at the cursor position in the input.
- Typed `Fe + O2 -> Fe2O3` → badge showed "Reaction", message showed
  "Equation is valid but not balanced."
- Clicked "Balance Equation" → equation became `4Fe + 3O2 -> 2Fe2O3`,
  message updated to "Equation is balanced."
- Typed `H2 + XYZ -> H2O` → message correctly showed `"XYZ" isn't a
  recognized chemical formula.`
- Used Undo after that invalid edit → correctly reverted to the last
  good state (`4Fe + 3O2 -> 2Fe2O3`).
- Clicked Cancel after all of the above → block reverted to its
  original saved value (`2H2 + O2 -> 2H2O`), confirming cancel discards
  changes rather than silently keeping them.

---

## POC Complete

All planned features from the original scope are implemented: Lexical
foundation, block-based editing (paragraph/heading), the `/` slash
command and an equivalent toolbar (Text, Heading, 3D Model, Equation),
the `Model3DNode`, a full chemistry-aware `EquationNode` (smart parsing,
validation, and equation balancing), and AI text streaming driven by a
user-typed prompt. Every feature routes through the same Lexical
concepts — `editor.update()`, nodes, and `EditorState` — with no custom
engine layered on top of Lexical, and all chemistry logic lives in its
own plain-TypeScript module that Lexical never has to know about.

### Note: an experimental feature was tried and reverted

After the POC above was complete, a "block-based presentation" feature
was attempted on top of it: hovering blocks to move/select/duplicate/
delete them, and later a full free-form canvas (drag-anywhere, resize,
rotate — like Canva/PowerPoint). That work ran into two problems: it was
a genuine architecture shift away from "Lexical is the foundation" (a
canvas needs absolute x/y positioning, which Lexical's document model
doesn't have a concept of), and the browser-testing tooling used to
verify it broke partway through, so it was never fully confirmed
working.

That entire experiment (the `BlockActionsPlugin.tsx` file, the larger
playground sizing, and the related CSS) has been **reverted**, since
there's no git history in this project to fall back on and it couldn't
be verified as working. The project is back to the state described
above — the completed, verified POC.

---

## Full-Screen Layout: Editor + Options Sidebar

The next ask was simpler and purely visual: the editor was a small
centered box on the page; instead, it should fill the whole screen, with
a dedicated space (a sidebar) for the "options" — the 3D Model/Equation
buttons and the AI prompt box — instead of them floating above the
editor.

### What we added

- The whole page now fills the browser window edge to edge, with a thin
  title bar at the top.
- Below the title, the screen splits into two areas: the editor on the
  left (takes up all remaining space) and a fixed-width **options
  sidebar** on the right, holding the "Insert 3D Model" / "Insert
  Equation" buttons and the "Generate & Stream" prompt box.
- The editor box itself now grows to fill all the height it's given,
  instead of stopping at a fixed pixel height.

This is a layout-only change — no Lexical concepts changed. `Toolbar`
and `StreamPlugin` still work exactly as before; they're just displayed
in a different spot on the page and stacked vertically (since the
sidebar is narrower than the old horizontal bar was).

### A CSS lesson worth noting

Getting "fill the screen" to actually work took one extra fix: modern
CSS flexbox layouts (`.app` → `.app-body` → `.editor-layout` →
`.editor-main` → `.editor-shell`, each nested inside the last) need
`min-height: 0` set explicitly on every flex child in that chain.
Without it, a flex child's default minimum height is "as tall as its
content wants to be," which quietly overrides `flex: 1` and can make
the whole page taller than the actual browser window instead of exactly
filling it. Once `min-height: 0` was added down the chain, every
container's real height matched `window.innerHeight` exactly, confirmed
by directly measuring their bounding boxes in the browser.

### Files Changed

- `src/App.tsx` — wrapped `<Editor />` in a new `.app-body` container.
- `src/editor/Editor.tsx` — restructured into `.editor-layout`
  (`.editor-main` + `.editor-sidebar`), moved `<Toolbar />` and
  `<StreamPlugin />` into the sidebar.
- `src/index.css` — added `html, body, #root { height: 100% }`, needed
  as the base of the whole full-height chain.
- `src/App.css` — full rewrite of the layout rules: `.app`,
  `.app-title`, `.app-body`, `.editor-layout`, `.editor-main`,
  `.editor-sidebar`, `.sidebar-heading`, and `min-height: 0` fixes on
  every flex container in the chain.

### Verified

In the browser: confirmed via direct measurement that `.app`,
`.app-body`, `.editor-layout` all report a height exactly equal to
`window.innerHeight`, and that `.editor-shell` (the visible editor box)
and `.editor-sidebar` both stretch the full available height below the
title bar. Typed text into the editor to confirm normal editing still
works unaffected by the layout change.

---

## Fixing 3D Models Getting Cropped After Upload

A `.glb` model uploaded into the editor was showing only part of itself
— e.g. an engine model with its top half cut off, needing to scroll to
see the rest.

### What was actually wrong

Two separate problems stacked on top of each other:

1. **The box itself was too tall.** `.model3d-viewport` used a `4:3`
   aspect ratio with no height cap — in this project's wide main column,
   `4:3` works out to a very tall box, pushing the bottom of the model
   off-screen and forcing a scroll just to see the rest of it.
2. **The camera distance was hardcoded.** The block had
   `camera-orbit="0deg 75deg 105%"` — a fixed zoom distance that only
   looks right for models roughly that size. A bigger or differently-
   shaped model (like a wide, flat engine) ends up zoomed in too close,
   cropping it.

### The fix

- `.model3d-viewport` now uses `aspect-ratio: 4 / 3` **with** `max-height: 460px`, so it stays a reasonable size regardless of how wide the surrounding column is.

**The first fix attempt wasn't good enough — worth recording why.** Initially, `camera-orbit`'s zoom-distance value was changed from a fixed `"105%"` to the literal string `"auto"`, so `<model-viewer>` would calculate the right distance from each model's own bounding box. This looked correct immediately after upload — but a few seconds later, on its own, the camera drifted to a *different*, more zoomed-in position that cropped the model again (confirmed by watching the exact same model over several seconds — first fully visible, then cropped, with no rotation or interaction happening in between). A second attempt also tried adding `field-of-view="45deg"` to shrink the empty padding around the model — that made it worse, cropping a tall standing model's head and feet immediately.

**The actual fix:** stop relying on `<model-viewer>`'s automatic/idle framing behavior entirely, and instead compute the correct camera position ourselves, once, using `<model-viewer>`'s own official API method built for exactly this: `updateFraming()`. In `Model3DComponent`, a `ref` is attached to the `<model-viewer>` element, and a `useEffect` listens for its native `"load"` event (fired once the model file has actually finished loading and its real geometry is known). When that fires, we call `element.updateFraming()` followed by `element.jumpCameraToGoal()` to apply the result immediately. `auto-rotate` and the default `interaction-prompt` were both turned off, so nothing tries to move the camera again afterward — the one correct position, computed once, is the one that stays.

### Files Changed

- `src/editor/nodes/Model3DNode.tsx` — added a `ref` + `"load"`-event `useEffect` calling `updateFraming()`/`jumpCameraToGoal()` on the `<model-viewer>` element; removed `auto-rotate`; added `interaction-prompt="none"`.
- `src/App.css` — `.model3d-viewport` given a `max-height` alongside its aspect ratio.

### Verified

Tested with two very differently-shaped models to confirm the fix generalizes, not just for one file, and specifically re-checked a few seconds after load (not just immediately) since that's exactly where the earlier `"auto"` attempt failed:
- A wide, flat model (an engine) — previously cropped; now fully visible.
- A tall, upright model (a standing astronaut figure) — the harder case, since a tall subject in a landscape-shaped box is most likely to get cropped. Rendered fully (head to feet) immediately on load, and **confirmed stable several seconds later** — no drift, unlike the earlier attempt.

---

## Final Wrap-Up — This POC Is Done

One more thing got discussed before closing this out: whether the editor
should become a full PowerPoint/Canva-style "block-based presentation
tool" — free-position blocks, drag-anywhere, resize, rotate, the whole
canvas model. That was actually tried (see the free-form canvas section
earlier in this doc) and then deliberately reverted, because it's a
genuinely different kind of application — a canvas needs blocks with
absolute x/y positions, which isn't something a document engine like
Lexical models at all. Building that would mean Lexical stops being the
foundation of the layout, which contradicts the very first rule this
whole project was built around. The decision made here: **not** to build
that. This project's "block-based" requirement is fully satisfied by
what Lexical already gives a document editor — distinct block *types*
(paragraph, heading, 3D model, equation) that you insert via `/` or the
toolbar, exactly like Notion's blocks work. That's the right scope for
what this POC was actually trying to prove.

### Checking the original goal, point by point

| # | Requirement | Status |
|---|---|---|
| 1 | Lexical-based editor foundation | ✅ `LexicalComposer` + official plugins are the entire base — no custom engine hiding Lexical |
| 2 | Block-based editing | ✅ Paragraph, Heading, 3D Model, Equation — each a real Lexical node type |
| 3 | `/` slash command | ✅ Official `LexicalTypeaheadMenuPlugin`, plus an equivalent sidebar toolbar |
| 4 | AI text streaming | ✅ Prompt-driven mock reply, streamed chunk-by-chunk through `editor.update()` |
| 5 | 3D `.glb` model block | ✅ Real `DecoratorNode`, upload-and-display, reliably framed on load |
| 6 | Chemistry equation block | ✅ Real `DecoratorNode`, plain-English input, live preview, validation, and equation balancing |
| 7 | Simple documentation | ✅ `POC_PROGRESS.md` (this file) + `FILES_EXPLAINED.md` (technical file-by-file walkthrough) |

All seven original requirements are met. No further features are planned
for this POC — this is the finished deliverable.
