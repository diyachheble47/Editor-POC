// TabsNode — a row of pills; picking one shows its text below (steps of a
// process, stages, categories). Viewing is interactive; the ✎ button edits.

import { DecoratorNode } from 'lexical'
import type { EditorConfig, LexicalEditor, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical'
import { useState } from 'react'
import { useBlockData } from '../_shared/useBlockData'

export type TabItem = { title: string; text: string }
export type TabsData = { items: TabItem[] }
export type SerializedTabsNode = Spread<TabsData, SerializedLexicalNode>

const MAX_ITEMS = 8
export const DEFAULT_TABS: TabItem[] = [
  { title: '1. First step', text: 'Describe the first step here.' },
  { title: '2. Second step', text: 'Describe the second step here.' },
]

function TabsComponent({ nodeKey, initial }: { nodeKey: NodeKey; initial: TabsData }) {
  const { data, change, editing, setEditing, rootRef } = useBlockData<TabsData>(
    nodeKey, initial, (n, d) => { if (n instanceof TabsNode) n.setItems(d.items) },
  )
  const [active, setActive] = useState(0)
  const items = data.items
  const current = items[Math.min(active, items.length - 1)]

  const setItem = (i: number, patch: Partial<TabItem>) => change({ items: items.map((it, k) => (k === i ? { ...it, ...patch } : it)) })

  return (
    <div ref={rootRef} className={`rb-block${editing ? ' rb-editing' : ''}`} contentEditable={false}>
      <button type="button" className="rb-edit" onClick={() => setEditing(!editing)} title={editing ? 'Done' : 'Edit'} aria-label={editing ? 'Done editing' : 'Edit tabs'}>
        {editing ? 'Done' : '✎'}
      </button>

      {editing ? (
        <div className="rb-form">
          {items.map((it, i) => (
            <div key={i} className="rb-form-row">
              <input className="rb-input" value={it.title} placeholder="Tab title" onChange={e => setItem(i, { title: e.target.value })} onKeyDown={e => e.stopPropagation()} aria-label="Tab title" />
              <textarea className="rb-input" rows={2} value={it.text} placeholder="Text shown under the tab" onChange={e => setItem(i, { text: e.target.value })} onKeyDown={e => e.stopPropagation()} aria-label="Tab text" />
              {items.length > 1 && <button type="button" className="rt-x" onClick={() => change({ items: items.filter((_, k) => k !== i) })} title="Remove tab">×</button>}
            </div>
          ))}
          {items.length < MAX_ITEMS && (
            <button type="button" className="rt-btn" onClick={() => change({ items: [...items, { title: `${items.length + 1}. New tab`, text: '' }] })}>+ Tab</button>
          )}
        </div>
      ) : (
        <>
          <div className="tabs-pills" role="tablist">
            {items.map((it, i) => (
              <button key={i} type="button" role="tab" aria-selected={i === active} className={`tabs-pill${i === active ? ' active' : ''}`} onClick={() => setActive(i)}>
                {it.title || `Tab ${i + 1}`}
              </button>
            ))}
          </div>
          <div className="tabs-panel" role="tabpanel">{current?.text}</div>
        </>
      )}
    </div>
  )
}

export class TabsNode extends DecoratorNode<React.ReactElement> {
  __items: TabItem[]

  static getType(): string { return 'tabs' }
  static clone(node: TabsNode): TabsNode { return new TabsNode(node.__items, node.__key) }

  constructor(items: TabItem[] = DEFAULT_TABS, key?: NodeKey) {
    super(key)
    this.__items = items.length ? items : DEFAULT_TABS
  }

  exportJSON(): SerializedTabsNode { return { type: 'tabs', version: 1, items: this.__items } }
  static importJSON(s: SerializedTabsNode): TabsNode { return new TabsNode(s.items ?? DEFAULT_TABS) }

  setItems(items: TabItem[]): void { this.getWritable().__items = items.length ? items : DEFAULT_TABS }

  isInline(): boolean { return false }
  createDOM(_config: EditorConfig): HTMLElement { return document.createElement('div') }
  updateDOM(): boolean { return false }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement {
    return <TabsComponent nodeKey={this.getKey()} initial={{ items: this.__items }} />
  }
}

export function $createTabsNode(items?: TabItem[]): TabsNode { return new TabsNode(items) }
export function $isTabsNode(node: LexicalNode | null | undefined): node is TabsNode { return node instanceof TabsNode }
