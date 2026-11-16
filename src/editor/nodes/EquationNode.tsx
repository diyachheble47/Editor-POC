// Custom Lexical node for the "Equation" block (e.g. 2H2 + O2 -> 2H2O).
//
// Lexical concept: same pattern as Model3DNode — this extends
// `DecoratorNode`, so Lexical stores just the data (the equation source
// text) in the document tree, and React renders the actual visual. This
// proves the equation is a real Lexical node, not raw HTML pasted into
// the page.
//
// The node itself stays tiny on purpose — one plain string. All the
// smart behavior (parsing formulas/reactions, validating, balancing,
// rendering) lives in ../chemistry/* and EquationEditorPanel.tsx, kept
// completely separate from Lexical. This node's only job is to hold that
// string inside the Lexical document tree and hand it to the editor
// panel or the renderer.

import { $getNodeByKey, DecoratorNode } from 'lexical'
import type {
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import { useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import katex from 'katex'
import 'katex/contrib/mhchem'
import 'katex/dist/katex.min.css'
import { toKatexSource } from '../chemistry/toKatex'
import { EquationEditorPanel } from '../EquationEditorPanel'

export const DEFAULT_EQUATION = '2H2 + O2 -> 2H2O'

export type SerializedEquationNode = Spread<
  { equation: string },
  SerializedLexicalNode
>

function EquationComponent({
  nodeKey,
  equation,
}: {
  nodeKey: NodeKey
  equation: string
}) {
  const [editor] = useLexicalComposerContext()
  const [isEditing, setIsEditing] = useState(false)

  function save(value: string) {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof EquationNode) node.setEquation(value)
    })
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <EquationEditorPanel
        initialValue={equation || DEFAULT_EQUATION}
        onSave={save}
        onCancel={() => setIsEditing(false)}
      />
    )
  }

  // Lexical concept note: this is the only spot doing non-Lexical work —
  // asking KaTeX to turn the stored equation string into typeset HTML.
  // The result is just displayed; the node itself still only stores the
  // plain source string.
  const html = katex.renderToString(toKatexSource(equation || DEFAULT_EQUATION), {
    throwOnError: false,
    output: 'html',
  })

  return (
    <div
      className="equation-block"
      onClick={() => setIsEditing(true)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export class EquationNode extends DecoratorNode<React.ReactElement> {
  __equation: string

  static getType(): string {
    return 'equation'
  }

  static clone(node: EquationNode): EquationNode {
    return new EquationNode(node.__equation, node.__key)
  }

  constructor(equation: string = '', key?: NodeKey) {
    super(key)
    this.__equation = equation
  }

  exportJSON(): SerializedEquationNode {
    return { type: 'equation', version: 1, equation: this.__equation }
  }

  static importJSON(serializedNode: SerializedEquationNode): EquationNode {
    return new EquationNode(serializedNode.equation)
  }

  setEquation(equation: string): void {
    this.getWritable().__equation = equation
  }

  // Block-level: the default (true) makes Lexical wrap this in a paragraph.
  isInline(): boolean {
    return false
  }

  createDOM(_config: EditorConfig): HTMLElement {
    return document.createElement('div')
  }

  updateDOM(): boolean {
    return false
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement {
    return <EquationComponent nodeKey={this.getKey()} equation={this.__equation} />
  }
}

export function $createEquationNode(
  equation: string = DEFAULT_EQUATION,
): EquationNode {
  return new EquationNode(equation)
}

export function $isEquationNode(
  node: LexicalNode | null | undefined,
): node is EquationNode {
  return node instanceof EquationNode
}
