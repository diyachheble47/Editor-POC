import { DecoratorNode, $getNodeByKey } from 'lexical'
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

export type SerializedMolecule3DNode = Spread<
  { formula: string },
  SerializedLexicalNode
>

function Molecule3DComponent({
  nodeKey,
  formula,
}: {
  nodeKey: NodeKey
  formula: string
}) {
  const [editor] = useLexicalComposerContext()
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(formula)

  function save() {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof Molecule3DNode) node.setFormula(draft)
    })
    setIsEditing(false)
  }

  return (
    <div className="molecule3d-block">
      <div className="molecule3d-header">
        <span className="molecule3d-icon">🧬</span>
        <span className="molecule3d-label">3D Molecule</span>
        {!isEditing && (
          <button className="molecule3d-edit-btn" onClick={() => { setDraft(formula); setIsEditing(true) }}>
            Edit
          </button>
        )}
      </div>
      <div className="molecule3d-viewport">
        <div className="molecule3d-formula-display">{formula || 'H₂O'}</div>
        <div className="molecule3d-placeholder-note">
          Interactive 3D visualization — coming soon
        </div>
      </div>
      {isEditing && (
        <div className="molecule3d-edit-row">
          <input
            className="molecule3d-formula-input"
            value={draft}
            autoFocus
            placeholder="e.g. H2O, CH4, NaCl, C6H12O6"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') setIsEditing(false)
            }}
          />
          <button className="molecule3d-save-btn" onClick={save}>Done</button>
          <button className="molecule3d-cancel-btn" onClick={() => setIsEditing(false)}>Cancel</button>
        </div>
      )}
    </div>
  )
}

export class Molecule3DNode extends DecoratorNode<React.ReactElement> {
  __formula: string

  static getType(): string {
    return 'molecule3d'
  }

  static clone(node: Molecule3DNode): Molecule3DNode {
    return new Molecule3DNode(node.__formula, node.__key)
  }

  constructor(formula: string = 'H₂O', key?: NodeKey) {
    super(key)
    this.__formula = formula
  }

  exportJSON(): SerializedMolecule3DNode {
    return { type: 'molecule3d', version: 1, formula: this.__formula }
  }

  static importJSON(serialized: SerializedMolecule3DNode): Molecule3DNode {
    return new Molecule3DNode(serialized.formula)
  }

  setFormula(formula: string): void {
    this.getWritable().__formula = formula
  }

  createDOM(_config: EditorConfig): HTMLElement {
    return document.createElement('div')
  }

  updateDOM(): boolean {
    return false
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement {
    return <Molecule3DComponent nodeKey={this.getKey()} formula={this.__formula} />
  }
}

export function $createMolecule3DNode(formula?: string): Molecule3DNode {
  return new Molecule3DNode(formula)
}

export function $isMolecule3DNode(node: LexicalNode | null | undefined): node is Molecule3DNode {
  return node instanceof Molecule3DNode
}
