// TocNode — a row of chips linking to the document's sections ("1. Intro",
// "2. Anatomy"...). It builds itself from the Section headings (or, if there
// are none, the level-2 headings) and follows the document as it changes.

import { DecoratorNode, $getRoot } from 'lexical'
import type { EditorConfig, LexicalEditor, LexicalNode, SerializedLexicalNode } from 'lexical'
import { $isHeadingNode } from '@lexical/rich-text'
import { useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

type Entry = { key: string; text: string }

function collect(editor: LexicalEditor): Entry[] {
  return editor.getEditorState().read(() => {
    const heads = $getRoot().getChildren().filter(n => $isHeadingNode(n))
    const sections = heads.filter(n => n.getType() === 'section')
    const list = sections.length ? sections : heads.filter(n => n.getTag() === 'h2')
    return list.map(n => ({ key: n.getKey(), text: n.getTextContent().trim() })).filter(e => e.text)
  })
}

function TocComponent() {
  const [editor] = useLexicalComposerContext()
  const [entries, setEntries] = useState<Entry[]>(() => collect(editor))

  useEffect(() => {
    return editor.registerUpdateListener(({ dirtyElements }) => {
      if (dirtyElements.size === 0) return
      const next = collect(editor)
      setEntries(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    })
  }, [editor])

  const go = (key: string) => editor.getElementByKey(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <nav className="toc-chips" contentEditable={false} aria-label="Contents">
      {entries.length === 0
        ? <span className="toc-empty">Contents: add Section headings and links to them appear here.</span>
        : entries.map(e => (
            <button key={e.key} type="button" className="toc-chip" onClick={() => go(e.key)}>{e.text}</button>
          ))}
    </nav>
  )
}

export class TocNode extends DecoratorNode<React.ReactElement> {
  static getType(): string { return 'toc' }
  static clone(node: TocNode): TocNode { return new TocNode(node.__key) }

  exportJSON(): SerializedLexicalNode { return { type: 'toc', version: 1 } }
  static importJSON(): TocNode { return new TocNode() }

  isInline(): boolean { return false }
  createDOM(_config: EditorConfig): HTMLElement { return document.createElement('div') }
  updateDOM(): boolean { return false }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement { return <TocComponent /> }
}

export function $createTocNode(): TocNode { return new TocNode() }
export function $isTocNode(node: LexicalNode | null | undefined): node is TocNode { return node instanceof TocNode }
