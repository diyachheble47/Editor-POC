// MathNode — unified LaTeX math + chemistry equation block.
//
// Architecture: state (latex, displayMode, variant) lives in the Lexical node.
// React rendering (MathComponent) is purely presentational — reads node props,
// writes back only via editor.update(). Editing happens in the right-sidebar
// MathEditorPanel; clicking the block opens that panel via EditorUIContext.
//
// variant='math'      → pure LaTeX, rendered by KaTeX
// variant='chemistry' → mhchem \ce{...} notation, rendered by KaTeX + mhchem

import { DecoratorNode } from 'lexical'
import type {
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import { useMemo } from 'react'
import katex from 'katex'
import 'katex/contrib/mhchem'
import 'katex/dist/katex.min.css'
import { useEditorUI } from '../../context/EditorUIContext'
import type { MathVariant } from '../../context/EditorUIContext'

export type { MathVariant }

export type SerializedMathNode = Spread<
  { latex: string; displayMode: boolean; variant: MathVariant },
  SerializedLexicalNode
>

export const DEFAULT_MATH_LATEX = 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'
export const DEFAULT_CHEM_LATEX = '\\ce{2H2 + O2 -> 2H2O}'

function MathComponent({
  nodeKey,
  latex,
  displayMode,
  variant,
}: {
  nodeKey: NodeKey
  latex: string
  displayMode: boolean
  variant: MathVariant
}) {
  const { update } = useEditorUI()

  const { html, error } = useMemo(() => {
    try {
      return {
        html: katex.renderToString(latex || (variant === 'chemistry' ? DEFAULT_CHEM_LATEX : DEFAULT_MATH_LATEX), {
          throwOnError: true,
          displayMode,
          output: 'html',
        }),
        error: '',
      }
    } catch (e) {
      return {
        html: '',
        error: String(e instanceof Error ? e.message : e),
      }
    }
  }, [latex, displayMode, variant])

  function handleClick() {
    update({
      activeMath: { nodeKey, latex, variant, displayMode },
    })
  }

  return (
    <div
      className={`math-block math-${variant}${displayMode ? ' math-display' : ' math-inline'}`}
      contentEditable={false}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
      title="Click to edit"
    >
      {error
        ? (
          <div className="math-block-error">
            <div style={{ marginBottom: 4, fontWeight: 600 }}>Invalid LaTeX</div>
            <code>{latex}</code>
          </div>
        )
        : <div dangerouslySetInnerHTML={{ __html: html }} />
      }
      <span className="math-block-hint">Click to edit</span>
    </div>
  )
}

export class MathNode extends DecoratorNode<React.ReactElement> {
  __latex: string
  __displayMode: boolean
  __variant: MathVariant

  static getType(): string {
    return 'math'
  }

  static clone(node: MathNode): MathNode {
    return new MathNode(node.__latex, node.__displayMode, node.__variant, node.__key)
  }

  constructor(
    latex: string = DEFAULT_MATH_LATEX,
    displayMode = true,
    variant: MathVariant = 'math',
    key?: NodeKey,
  ) {
    super(key)
    this.__latex = latex
    this.__displayMode = displayMode
    this.__variant = variant
  }

  // ── Serialization ────────────────────────────────────────────

  exportJSON(): SerializedMathNode {
    return {
      type: 'math',
      version: 1,
      latex: this.__latex,
      displayMode: this.__displayMode,
      variant: this.__variant,
    }
  }

  static importJSON(s: SerializedMathNode): MathNode {
    return new MathNode(s.latex, s.displayMode, s.variant)
  }

  // ── Mutations (always via getWritable for history/collab) ────

  setLatex(latex: string): void {
    this.getWritable().__latex = latex
  }

  setDisplayMode(displayMode: boolean): void {
    this.getWritable().__displayMode = displayMode
  }

  setVariant(variant: MathVariant): void {
    this.getWritable().__variant = variant
  }

  // ── DOM host (Lexical owns the outer div; React owns the inside) ─

  // Display math is a block; inline math stays inline in its paragraph.
  isInline(): boolean {
    return !this.__displayMode
  }

  createDOM(_config: EditorConfig): HTMLElement {
    return document.createElement('div')
  }

  updateDOM(): boolean {
    return false
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactElement {
    return (
      <MathComponent
        nodeKey={this.getKey()}
        latex={this.__latex}
        displayMode={this.__displayMode}
        variant={this.__variant}
      />
    )
  }
}

export function $createMathNode(
  latex: string = DEFAULT_MATH_LATEX,
  displayMode = true,
  variant: MathVariant = 'math',
): MathNode {
  return new MathNode(latex, displayMode, variant)
}

export function $isMathNode(
  node: LexicalNode | null | undefined,
): node is MathNode {
  return node instanceof MathNode
}
