# Custom Node Pattern Guide

How to add a new custom block (e.g. MathNode, QuizNode) without touching unrelated editor code.

---

## Files to create

```
src/editor/nodes/<name>/
  <Name>Node.tsx          ← Lexical node class + React component
  index.ts                ← Self-registration entry point
  <Name>Node.test.ts      ← Unit tests
```

Then add **one import** to `src/editor/customNodes.ts`:

```ts
import './nodes/<name>'
```

That is the only change to existing files.

---

## 1 — `<Name>Node.tsx`

```tsx
import { DecoratorNode } from 'lexical'
import type { EditorConfig, LexicalEditor, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical'

// 1a. Serialized shape (add all custom properties here)
export type SerializedMathNode = Spread<
  { latex: string },
  SerializedLexicalNode
>

// 1b. React component — reads from props, writes back via editor.update()
function MathComponent({ nodeKey, latex }: { nodeKey: NodeKey; latex: string }) {
  // ...render KaTeX, handle click-to-edit, etc.
  return <div className="math-block">{latex}</div>
}

// 1c. Lexical node class
export class MathNode extends DecoratorNode<React.ReactElement> {
  __latex: string

  static getType() { return 'math' }
  static clone(node: MathNode) { return new MathNode(node.__latex, node.__key) }

  constructor(latex = '', key?: NodeKey) {
    super(key)
    this.__latex = latex
  }

  // Serialization
  exportJSON(): SerializedMathNode {
    return { type: 'math', version: 1, latex: this.__latex }
  }
  static importJSON(s: SerializedMathNode): MathNode {
    return new MathNode(s.latex)
  }

  // Mutations — always through getWritable() so undo/redo and collab work
  setLatex(latex: string) { this.getWritable().__latex = latex }

  // DOM host (Lexical owns the outer element; React owns the inside)
  createDOM(_: EditorConfig): HTMLElement { return document.createElement('div') }
  updateDOM(): boolean { return false }

  decorate(_: LexicalEditor): React.ReactElement {
    return <MathComponent nodeKey={this.getKey()} latex={this.__latex} />
  }
}

// 1d. Factory + type guard (follow the Lexical $-prefix convention)
export function $createMathNode(latex = '') { return new MathNode(latex) }
export function $isMathNode(n: LexicalNode | null | undefined): n is MathNode {
  return n instanceof MathNode
}
```

---

## 2 — `index.ts` (self-registration)

```ts
import { registerNode } from '../../nodeRegistry'
import { registerBlock, insertDecoratorNode } from '../../blockRegistry'
import { MathNode, $createMathNode } from './MathNode'

registerNode(MathNode)

registerBlock({
  key: 'math',
  label: 'Math',
  icon: '∑',
  description: 'LaTeX math expression.',
  category: 'stem',
  status: 'available',
  keywords: ['math', 'latex', 'equation', 'formula'],
  insert: (editor) => insertDecoratorNode(editor, () => $createMathNode()),
  inSlash: true,
  inSidebar: true,
})

export { MathNode, $createMathNode } from './MathNode'
export type { SerializedMathNode } from './MathNode'
```

---

## 3 — `customNodes.ts` (one-line change)

```ts
import './nodes/math'       // ← add this line
import './nodes/callout'
```

---

## 4 — Tests

```ts
import { createEditor, $getRoot } from 'lexical'
import { MathNode, $createMathNode, $isMathNode } from './MathNode'

function makeEditor() {
  return createEditor({ nodes: [MathNode], onError: e => { throw e } })
}

describe('MathNode', () => {
  test('getType', () => expect(MathNode.getType()).toBe('math'))

  test('round-trip JSON', () => {
    const editor = makeEditor()
    editor.update(() => {
      const node = $createMathNode('E = mc^2')
      $getRoot().append(node)
      const json = node.exportJSON()
      const restored = MathNode.importJSON(json)
      expect(restored.__latex).toBe('E = mc^2')
    }, { discrete: true })
  })

  test('setLatex via getWritable', () => {
    const editor = makeEditor()
    editor.update(() => $getRoot().append($createMathNode('a^2')), { discrete: true })
    editor.update(() => {
      ($getRoot().getFirstChild() as MathNode).setLatex('b^2')
    }, { discrete: true })
    editor.read(() => {
      expect(($getRoot().getFirstChild() as MathNode).__latex).toBe('b^2')
    })
  })
})
```

---

## Node checklist

| # | Requirement | Where |
|---|-------------|-------|
| 1 | Node implementation | `<Name>Node.tsx` — `class FooNode extends DecoratorNode` |
| 2 | Serialized representation | `exportJSON()` / `importJSON()` / `SerializedFooNode` type |
| 3 | React rendering | `FooComponent` + `decorate()` |
| 4 | Block insertion command | `$createFooNode` + `insertDecoratorNode` in `index.ts` |
| 5 | Slash command registration | `registerBlock({...})` in `index.ts` |
| 6 | Selection support | Free — Lexical handles DecoratorNode selection |
| 7 | Update support | `setXxx()` methods using `getWritable()` |
| 8 | Delete / Duplicate | Free — handled by `BlockControlsPlugin` |
| 9 | Serialization / deserialization | `exportJSON` / `importJSON` + `type` string |
| 10 | Tests | `<Name>Node.test.ts` — run with `npm test` |

---

## Planned nodes

These follow this exact pattern. Do not implement until ready.

| Node | Type string | Key properties |
|------|-------------|----------------|
| `MathNode` | `'math'` | `latex: string` |
| `ChemistryNode` | `'chemistry'` | `source: string`, `mode: 'equation'\|'structure'` |
| `Model3DNode` | `'model3d'` | `url: string`, `format: 'gltf'\|'obj'` |
| `DiagramNode` | `'diagram'` | `source: string`, `engine: 'mermaid'\|'dot'` |
| `QuizNode` | `'quiz'` | `question: string`, `choices: string[]`, `correct: number` |
| `AIContentNode` | `'ai-content'` | `prompt: string`, `output: string`, `model: string` |
