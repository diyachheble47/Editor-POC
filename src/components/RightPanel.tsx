import { useCallback, useEffect, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import katex from 'katex'
import 'katex/contrib/mhchem'
import { useDocument } from '../context/DocumentContext'
import { AgentPanel } from './AgentPanel'
import { useEditorUI } from '../editor/context/EditorUIContext'
import type { AgentSession, ActiveModel3D } from '../editor/context/EditorUIContext'
import { $isMathNode } from '../editor/nodes/math/MathNode'
import { $getModel3DNodeByKey } from '../editor/nodes/model3d/Model3DNode'
import type { Model3DDisplayMode } from '../editor/nodes/model3d/Model3DNode'

interface RightPanelProps {
  isOpen: boolean
}

// The right panel only shows the properties of the block being edited (math
// formula, 3D model). Inserting blocks is done from the slash menu in the
// editor, not from here.
export function RightPanel({ isOpen }: RightPanelProps) {
  const { activeMath, activeModel3d, agent, update } = useEditorUI()
  const { activeDocId } = useDocument()

  // The agent works on one document; switching documents closes it.
  useEffect(() => { update({ agent: null }) }, [activeDocId, update])

  // The /agent slash command announces itself with this event.
  useEffect(() => {
    const open = (e: Event) => update({ agent: (e as CustomEvent<AgentSession>).detail, activeMath: null, activeModel3d: null })
    window.addEventListener('tnb:open-agent', open)
    return () => window.removeEventListener('tnb:open-agent', open)
  }, [update])

  return (
    <aside className={`app-sidebar-right${isOpen ? '' : ' closed'}${agent ? ' agent-open' : ''}`} aria-label="Tools">
      <div className="rpanel-inner">
        <div className="rpanel-content">
          {agent ? (
            <AgentPanel key={agent.context.length + String(agent.empty)} session={agent} />
          ) : activeMath ? (
            <MathEditorPanel />
          ) : activeModel3d ? (
            <Model3DPropertiesPanel />
          ) : null}
        </div>
      </div>
    </aside>
  )
}

/* ── MATH EDITOR PANEL ──────────────────────────────────────── */

const FUNCTION_SYMBOLS = [
  { label: 'sin', insert: '\\sin(□)', cursor: 1 },
  { label: 'cos', insert: '\\cos(□)', cursor: 1 },
  { label: 'tan', insert: '\\tan(□)', cursor: 1 },
  { label: 'ln', insert: '\\ln(□)', cursor: 1 },
  { label: 'log', insert: '\\log(□)', cursor: 1 },
  { label: 'mod', insert: ' \\bmod ', cursor: 0 },
  { label: '|x|', insert: '|□|', cursor: 1 },
  { label: '‖x‖', insert: '\\|□\\|', cursor: 1 },
]

const MATH_SYMBOLS = [
  { label: 'frac', insert: '\\frac{□}{□}', cursor: 6 },
  { label: '√', insert: '\\sqrt{□}', cursor: 1 },
  { label: 'x²', insert: '^{□}', cursor: 1 },
  { label: 'xₙ', insert: '_{□}', cursor: 1 },
  { label: '∫', insert: '\\int', cursor: 0 },
  { label: '∑', insert: '\\sum_{□}^{□}', cursor: 5 },
  { label: '∞', insert: '\\infty', cursor: 0 },
  { label: '≈', insert: '\\approx', cursor: 0 },
  { label: '≤', insert: '\\leq', cursor: 0 },
  { label: '≥', insert: '\\geq', cursor: 0 },
  { label: '≠', insert: '\\neq', cursor: 0 },
  { label: '±', insert: '\\pm', cursor: 0 },
]

const GREEK_SYMBOLS = [
  { label: 'α', insert: '\\alpha', cursor: 0 },
  { label: 'β', insert: '\\beta', cursor: 0 },
  { label: 'γ', insert: '\\gamma', cursor: 0 },
  { label: 'δ', insert: '\\delta', cursor: 0 },
  { label: 'θ', insert: '\\theta', cursor: 0 },
  { label: 'π', insert: '\\pi', cursor: 0 },
  { label: 'σ', insert: '\\sigma', cursor: 0 },
  { label: 'λ', insert: '\\lambda', cursor: 0 },
  { label: 'ω', insert: '\\omega', cursor: 0 },
]

const CHEM_SYMBOLS = [
  { label: '\\ce{}', insert: '\\ce{□}', cursor: 1 },
  { label: '→', insert: ' -> ', cursor: 0 },
  { label: '⇌', insert: ' <=> ', cursor: 0 },
  { label: '(s)', insert: '(s)', cursor: 0 },
  { label: '(l)', insert: '(l)', cursor: 0 },
  { label: '(g)', insert: '(g)', cursor: 0 },
  { label: '(aq)', insert: '(aq)', cursor: 0 },
]

function renderPreview(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, { throwOnError: true, displayMode, output: 'html' })
  } catch {
    return ''
  }
}

function MathEditorPanel() {
  const [editor] = useLexicalComposerContext()
  const { activeMath, update } = useEditorUI()
  const [draft, setDraft] = useState(activeMath?.latex ?? '')
  const [displayMode, setDisplayMode] = useState(activeMath?.displayMode ?? true)
  const [previewHtml, setPreviewHtml] = useState(() =>
    renderPreview(activeMath?.latex ?? '', activeMath?.displayMode ?? true)
  )
  const [previewError, setPreviewError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Clicking anywhere outside this panel closes it and drops back to the
  // plain block view — same "goes back to the background" behavior as the
  // 3D model viewer when you click away from it.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!panelRef.current?.contains(e.target as Node)) {
        update({ activeMath: null })
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [update])

  // Sync draft when activeMath changes (different node selected)
  useEffect(() => {
    if (!activeMath) return
    setDraft(activeMath.latex)
    setDisplayMode(activeMath.displayMode)
  }, [activeMath?.nodeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced preview
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const html = katex.renderToString(draft, { throwOnError: true, displayMode, output: 'html' })
        setPreviewHtml(html)
        setPreviewError('')
      } catch (e) {
        setPreviewHtml('')
        setPreviewError(String(e instanceof Error ? e.message : e))
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [draft, displayMode])

  const insertAtCursor = useCallback((snippet: string, cursorBackBy: number) => {
    const ta = textareaRef.current
    if (!ta) {
      setDraft(prev => prev + snippet)
      return
    }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const actual = snippet.replace('□', '')
    const newVal = draft.slice(0, start) + actual + draft.slice(end)
    setDraft(newVal)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + actual.length - cursorBackBy
      ta.setSelectionRange(pos, pos)
    })
  }, [draft])

  function save() {
    if (!activeMath) return
    editor.update(() => {
      const node = $getNodeByKey(activeMath.nodeKey)
      if ($isMathNode(node)) {
        node.setLatex(draft)
        node.setDisplayMode(displayMode)
      }
    })
    update({ activeMath: null })
  }

  function close() {
    update({ activeMath: null })
  }

  const variant = activeMath?.variant ?? 'math'

  return (
    <div className="math-editor-panel" ref={panelRef}>
      {/* Header */}
      <div className="math-editor-header">
        <button type="button" className="math-editor-back-btn" onClick={close} title="Back">
          ←
        </button>
        <span className="math-editor-title">
          {variant === 'chemistry' ? 'Chemistry' : 'Math'} Editor
        </span>
        <span className="math-editor-badge">KaTeX</span>
      </div>

      {/* Live preview */}
      <div className="math-preview">
        {previewHtml
          ? <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          : previewError
            ? <span className="math-preview-error">{previewError}</span>
            : <span style={{ color: 'var(--c-text-3)', fontSize: 12 }}>Preview will appear here…</span>
        }
      </div>

      {/* LaTeX input */}
      <div className="math-editor-label">LaTeX source</div>
      <textarea
        ref={textareaRef}
        className="math-editor-textarea"
        value={draft}
        autoFocus
        placeholder={variant === 'chemistry' ? '\\ce{2H2 + O2 -> 2H2O}' : '\\frac{a}{b}'}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
          if (e.key === 'Escape') close()
        }}
      />

      {/* Functions — trig/log only make sense for math, not chemistry */}
      {variant !== 'chemistry' && (
      <div className="math-symbol-section">
        <div className="math-symbol-label">Functions</div>
        <div className="math-symbol-row">
          {FUNCTION_SYMBOLS.map(s => (
            <button
              key={s.label}
              type="button"
              className="math-sym-btn"
              title={s.insert}
              onClick={() => insertAtCursor(s.insert, s.cursor)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Symbol shortcuts — Math */}
      {variant !== 'chemistry' && (
      <div className="math-symbol-section">
        <div className="math-symbol-label">Symbols</div>
        <div className="math-symbol-row">
          {MATH_SYMBOLS.map(s => (
            <button
              key={s.label}
              type="button"
              className="math-sym-btn"
              title={s.insert}
              onClick={() => insertAtCursor(s.insert, s.cursor)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Greek */}
      {variant !== 'chemistry' && (
      <div className="math-symbol-section">
        <div className="math-symbol-label">Greek</div>
        <div className="math-symbol-row">
          {GREEK_SYMBOLS.map(s => (
            <button
              key={s.label}
              type="button"
              className="math-sym-btn"
              onClick={() => insertAtCursor(s.insert, s.cursor)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Chemistry shortcuts */}
      {variant === 'chemistry' && (
        <div className="math-symbol-section">
          <div className="math-symbol-label">Chemistry</div>
          <div className="math-symbol-row">
            {CHEM_SYMBOLS.map(s => (
              <button
                key={s.label}
                type="button"
                className="math-sym-btn"
                onClick={() => insertAtCursor(s.insert, s.cursor)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Display mode toggle */}
      <label className="math-display-toggle">
        <input
          type="checkbox"
          checked={displayMode}
          onChange={e => setDisplayMode(e.target.checked)}
        />
        Display mode (centered, full size)
      </label>

      {/* Actions */}
      <div className="math-editor-actions">
        <button type="button" className="math-save-btn" onClick={save}>
          Save (⌘↵)
        </button>
        <button type="button" className="math-close-btn" onClick={close}>
          Close
        </button>
      </div>
    </div>
  )
}

/* ── MODEL 3D PROPERTIES PANEL ─────────────────────────────── */

function Model3DPropertiesPanel() {
  const [editor] = useLexicalComposerContext()
  const { activeModel3d, update } = useEditorUI()

  if (!activeModel3d) return null

  const { nodeKey, scale, animation, display, fileName } = activeModel3d

  function patch(changes: Partial<ActiveModel3D>) {
    update({ activeModel3d: { ...activeModel3d, ...changes } as ActiveModel3D })
  }

  function applyScale(val: number) {
    patch({ scale: val })
    editor.update(() => {
      $getModel3DNodeByKey(nodeKey)?.setScale(val)
    })
  }

  function applyAnimation(animPatch: object) {
    const next = { ...animation, ...animPatch }
    patch({ animation: next })
    editor.update(() => {
      $getModel3DNodeByKey(nodeKey)?.setAnimation(animPatch)
    })
  }

  function applyDisplay(dispPatch: Partial<{ mode: Model3DDisplayMode; height: number; widthPercent: number }>) {
    const next = { ...display, ...dispPatch }
    patch({ display: next })
    editor.update(() => {
      $getModel3DNodeByKey(nodeKey)?.setDisplay(dispPatch)
    })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      patch({ modelUrl: url, fileName: file.name })
      editor.update(() => {
        $getModel3DNodeByKey(nodeKey)?.setModel(url, file.name)
      })
    }
    reader.onerror = () => {
      window.alert(reader.error?.message || 'Could not read file')
    }
    reader.readAsDataURL(file)
  }

  function close() {
    update({ activeModel3d: null })
  }

  return (
    <div className="model3d-props-panel">
      <div className="math-editor-header">
        <button type="button" className="math-editor-back-btn" onClick={close} title="Back">←</button>
        <span className="math-editor-title">3D Model Properties</span>
        <span className="math-editor-badge">Three.js</span>
      </div>

      <div className="model3d-props-file">
        <span className="model3d-props-label">File</span>
        <span className="model3d-props-filename">{fileName || 'No file'}</span>
        <label className="model3d-upload-label model3d-upload-label--small">
          Replace
          <input type="file" accept=".glb,.gltf" className="model3d-upload-input" onChange={handleFileChange} />
        </label>
      </div>

      <div className="model3d-props-row">
        <label className="model3d-props-label" htmlFor="m3d-scale">
          Scale <span className="model3d-props-value">{scale.toFixed(1)}×</span>
        </label>
        <input
          id="m3d-scale"
          type="range"
          min={0.1}
          max={5}
          step={0.1}
          value={scale}
          className="model3d-props-slider"
          onChange={e => applyScale(Number(e.target.value))}
        />
      </div>

      <div className="model3d-props-row">
        <label className="model3d-props-label" htmlFor="m3d-height">
          Height <span className="model3d-props-value">{display.height}px</span>
        </label>
        <input
          id="m3d-height"
          type="range"
          min={160}
          max={640}
          step={20}
          value={display.height}
          className="model3d-props-slider"
          onChange={e => applyDisplay({ height: Number(e.target.value) })}
        />
      </div>

      <label className="math-display-toggle">
        <input
          type="checkbox"
          checked={animation.autoRotate}
          onChange={e => applyAnimation({ autoRotate: e.target.checked })}
        />
        Auto-rotate
      </label>

      {animation.autoRotate && (
        <div className="model3d-props-row">
          <label className="model3d-props-label" htmlFor="m3d-rot-speed">
            Speed <span className="model3d-props-value">{animation.rotationSpeed.toFixed(1)}</span>
          </label>
          <input
            id="m3d-rot-speed"
            type="range"
            min={0.5}
            max={10}
            step={0.5}
            value={animation.rotationSpeed}
            className="model3d-props-slider"
            onChange={e => applyAnimation({ rotationSpeed: Number(e.target.value) })}
          />
        </div>
      )}

      <div className="model3d-props-row">
        <span className="model3d-props-label">Display mode</span>
        <div className="model3d-props-modes">
          {([
            ['inline', 'Inline'],
            ['fullwidth', 'Full width'],
            ['float-left', 'Float left'],
            ['float-right', 'Float right'],
          ] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              className={`model3d-mode-btn${display.mode === m ? ' active' : ''}`}
              onClick={() => applyDisplay({ mode: m })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {(display.mode === 'float-left' || display.mode === 'float-right') && (
        <div className="model3d-props-row">
          <label className="model3d-props-label" htmlFor="m3d-width">
            Width <span className="model3d-props-value">{display.widthPercent}%</span>
          </label>
          <input
            id="m3d-width"
            type="range"
            min={20}
            max={70}
            step={5}
            value={display.widthPercent}
            className="model3d-props-slider"
            onChange={e => applyDisplay({ widthPercent: Number(e.target.value) })}
          />
          <p className="model3d-props-hint">Surrounding paragraph text will wrap around the model.</p>
        </div>
      )}
    </div>
  )
}

