// Columns layout — ElementNodes (not DecoratorNodes).
//
// Unlike CalloutNode/Model3DNode (DecoratorNode + React component), a column
// needs to hold *arbitrary rich content* — paragraphs, headings, lists, even
// other custom blocks — side by side. Lexical already knows how to render
// and edit a tree of ElementNodes; we don't need a nested editor or React
// component at all, just two plain ElementNode subclasses that Lexical lays
// out as DOM siblings via flexbox.

import { $createParagraphNode, $getRoot, $getSelection, $isElementNode, $isRangeSelection, ElementNode } from 'lexical'
import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  RangeSelection,
  SerializedElementNode,
} from 'lexical'

/* ── ColumnsContainerNode — the flex row holding N columns ─────────────── */

export class ColumnsContainerNode extends ElementNode {
  static getType(): string {
    return 'columns-container'
  }

  static clone(node: ColumnsContainerNode): ColumnsContainerNode {
    return new ColumnsContainerNode(node.__key)
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    div.className = 'columns-container'
    return div
  }

  updateDOM(): boolean {
    return false
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-columns-container', 'true')
    return { element }
  }

  static importJSON(): ColumnsContainerNode {
    return $createColumnsContainerNode()
  }

  exportJSON(): SerializedElementNode {
    return {
      ...super.exportJSON(),
      type: 'columns-container',
      version: 1,
    }
  }

  // If every column gets deleted, the empty shell disappears too instead of
  // leaving a stray node behind.
  canBeEmpty(): boolean {
    return false
  }

  isShadowRoot(): boolean {
    return false
  }
}

export function $createColumnsContainerNode(): ColumnsContainerNode {
  return new ColumnsContainerNode()
}

export function $isColumnsContainerNode(
  node: LexicalNode | null | undefined,
): node is ColumnsContainerNode {
  return node instanceof ColumnsContainerNode
}

/* ── ColumnNode — one column; a normal editable region ──────────────────── */

export class ColumnNode extends ElementNode {
  static getType(): string {
    return 'columns-item'
  }

  static clone(node: ColumnNode): ColumnNode {
    return new ColumnNode(node.__key)
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    div.className = 'columns-item'
    return div
  }

  updateDOM(): boolean {
    return false
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-columns-item', 'true')
    return { element }
  }

  static importDOM(): DOMConversionMap | null {
    return null
  }

  static importJSON(): ColumnNode {
    return $createColumnNode()
  }

  exportJSON(): SerializedElementNode {
    return {
      ...super.exportJSON(),
      type: 'columns-item',
      version: 1,
    }
  }

  // A column can legitimately sit empty (user deleted all its text) without
  // being auto-removed — it's still a real column in the layout.
  canBeEmpty(): boolean {
    return true
  }

  // NOTE: deliberately NOT overriding isShadowRoot() here. Marking a nested
  // ElementNode as a shadow root sounds like the right way to make a column a
  // self-contained merge boundary, but Lexical's internal deleteBackward/
  // deleteForward caret-walk treats a shadow root specially in a way that, in
  // practice, deleted unrelated content elsewhere in the document when
  // Backspace was pressed at a column's start. ColumnsPlugin.tsx intercepts
  // Backspace/Delete at column edges explicitly instead — don't re-add this
  // without re-verifying that exact scenario.
}

export function $createColumnNode(): ColumnNode {
  return new ColumnNode()
}

export function $isColumnNode(node: LexicalNode | null | undefined): node is ColumnNode {
  return node instanceof ColumnNode
}

/* ── Insertion helper ─────────────────────────────────────────────────── */

export function insertColumnsBlock(editor: LexicalEditor, columnCount: number): void {
  editor.update(() => {
    const container = $createColumnsContainerNode()
    for (let i = 0; i < columnCount; i++) {
      const column = $createColumnNode()
      column.append($createParagraphNode())
      container.append(column)
    }

    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      const anchorNode = (selection as RangeSelection).anchor.getNode()
      const topLevel = anchorNode.getTopLevelElementOrThrow()
      topLevel.insertAfter(container)
      if ($isElementNode(topLevel) && topLevel.getType() === 'paragraph' && topLevel.getTextContent() === '') {
        topLevel.remove()
      }
    } else {
      $getRoot().append(container)
    }

    const firstColumn = container.getFirstChild()
    if ($isElementNode(firstColumn)) {
      const firstParagraph = firstColumn.getFirstChild()
      if ($isElementNode(firstParagraph)) firstParagraph.selectEnd()
      else firstColumn.selectEnd()
    }
  })
}
