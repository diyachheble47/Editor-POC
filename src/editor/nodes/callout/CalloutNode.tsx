// CalloutNode — example custom DecoratorNode demonstrating the custom block pattern.
//
// Architecture: all document state lives in the Lexical node (__variant, __body).
// React rendering (CalloutComponent) is purely presentational and stateless w.r.t.
// the document — it reads from node properties and writes back only through
// editor.update(). This means serialization, copy/paste, and undo work for free.

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

export type CalloutVariant = 'info' | 'tip' | 'warning' | 'caution'

export type SerializedCalloutNode = Spread<
  { variant: CalloutVariant; body: string },
  SerializedLexicalNode
>

const VARIANT_META: Record<CalloutVariant, { icon: string; label: string }> = {
  info:    { icon: 'ℹ️',  label: 'Info' },
  tip:     { icon: '💡', label: 'Tip' },
  warning: { icon: '⚠️', label: 'Warning' },
  caution: { icon: '🚫', label: 'Caution' },
}

const VARIANTS = Object.keys(VARIANT_META) as CalloutVariant[]

function CalloutComponent({
  nodeKey,
  variant,
  body,
}: {
  nodeKey: NodeKey
  variant: CalloutVariant
  body: string
}) {
  const [editor] = useLexicalComposerContext()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(body)
  const meta = VARIANT_META[variant]

  function save() {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof CalloutNode) node.setBody(draft)
    })
    setEditing(false)
  }

  function cycleVariant() {
    const next = VARIANTS[(VARIANTS.indexOf(variant) + 1) % VARIANTS.length]
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node instanceof CalloutNode) node.setVariant(next)
    })
  }

  function startEditing() {
    setDraft(body)
    setEditing(true)
  }

  return (
    <div className={`callout-block callout-${variant}`} contentEditable={false}>
      <div className="callout-header">
        <button
          type="button"
          className="callout-variant-btn"
          onClick={cycleVariant}
          title="Cycle callout type"
        >
          {meta.icon}
        </button>
        <span className="callout-label">{meta.label}</span>
        {!editing && (
          <button type="button" className="callout-edit-btn" onClick={startEditing}>
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="callout-edit-area">
          <textarea
            className="callout-textarea"
            value={draft}
            autoFocus
            rows={3}
            placeholder="Add a note…"
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
          <div className="callout-edit-actions">
            <button type="button" className="callout-save-btn" onClick={save}>Done</button>
            <button type="button" className="callout-cancel-btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          className="callout-body"
          onClick={startEditing}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter') startEditing() }}
        >
          {body || <span className="callout-placeholder">Click to add a note…</span>}
        </div>
      )}
    </div>
  )
}

export class CalloutNode extends DecoratorNode<React.ReactElement> {
  __variant: CalloutVariant
  __body: string

  static getType(): string {
    return 'callout'
  }

  static clone(node: CalloutNode): CalloutNode {
    return new CalloutNode(node.__variant, node.__body, node.__key)
  }

  constructor(variant: CalloutVariant = 'info', body = '', key?: NodeKey) {
    super(key)
    this.__variant = variant
    this.__body = body
  }

  // ── Serialization ────────────────────────────────────────────

  exportJSON(): SerializedCalloutNode {
    return {
      type: 'callout',
      version: 1,
      variant: this.__variant,
      body: this.__body,
    }
  }

  static importJSON(s: SerializedCalloutNode): CalloutNode {
    return new CalloutNode(s.variant, s.body)
  }

  // ── Mutations (always via getWritable for Lexical's history/collab) ──

  setVariant(variant: CalloutVariant): void {
    this.getWritable().__variant = variant
  }

  setBody(body: string): void {
    this.getWritable().__body = body
  }

  // ── DOM host element (Lexical owns the outer div, React owns the inside) ──

  createDOM(_config: EditorConfig): HTMLElement {
    return document.createElement('div')
  }

  updateDOM(): boolean {
    // React re-renders handle all visual updates — no need for Lexical to patch the DOM.
    return false
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement {
    return (
      <CalloutComponent
        nodeKey={this.getKey()}
        variant={this.__variant}
        body={this.__body}
      />
    )
  }
}

export function $createCalloutNode(
  variant: CalloutVariant = 'info',
  body = '',
): CalloutNode {
  return new CalloutNode(variant, body)
}

export function $isCalloutNode(
  node: LexicalNode | null | undefined,
): node is CalloutNode {
  return node instanceof CalloutNode
}
