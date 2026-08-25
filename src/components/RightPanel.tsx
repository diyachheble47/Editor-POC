import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, $getRoot } from 'lexical'
import katex from 'katex'
import 'katex/contrib/mhchem'
import { BLOCK_REGISTRY, CATEGORY_ORDER, CATEGORY_LABELS } from '../editor/blockRegistry'
import { useEditorUI } from '../editor/context/EditorUIContext'
import type { RightTab } from '../editor/context/EditorUIContext'
import { $isMathNode } from '../editor/nodes/math/MathNode'
import { $getModel3DNodeByKey } from '../editor/nodes/model3d/Model3DNode'
import type { Model3DDisplayMode } from '../editor/nodes/model3d/Model3DNode'
import { useAIService } from '../ai/AIServiceContext'
import { useAIStream } from '../ai/useAIStream'
import { insertBlocks, replaceSelectionWithBlocks, captureRange } from '../ai/insertBlocks'
import type { SavedRange } from '../ai/insertBlocks'
import { AI_COMMANDS } from '../ai/commands'
import type { AICommandId } from '../ai/types'

const REPLACE_COMMANDS: Set<AICommandId> = new Set(['rewrite'])

export type { RightTab }

interface RightPanelProps {
  isOpen: boolean
  activeTab: RightTab
  onTabChange: (tab: RightTab) => void
}

export function RightPanel({ isOpen, activeTab, onTabChange }: RightPanelProps) {
  return (
    <aside className={`app-sidebar-right${isOpen ? '' : ' closed'}`} aria-label="Tools">
      <div className="rpanel-inner">

        {/* Tab strip */}
        <div className="rpanel-tabs" role="tablist" aria-label="Tool panels">
          <PanelTab id="insert" label="Insert" active={activeTab === 'insert'} onClick={() => onTabChange('insert')}>
            <InsertTabIcon />
          </PanelTab>
          <PanelTab id="ai" label="AI" active={activeTab === 'ai'} onClick={() => onTabChange('ai')}>
            <AITabIcon />
          </PanelTab>
          <PanelTab id="stem" label="STEM" active={activeTab === 'stem'} onClick={() => onTabChange('stem')}>
            <STEMTabIcon />
          </PanelTab>
          <PanelTab id="media" label="Media" active={activeTab === 'media'} onClick={() => onTabChange('media')}>
            <MediaTabIcon />
          </PanelTab>
        </div>

        {/* Panel content */}
        <div
          className="rpanel-content"
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
        >
          {activeTab === 'insert' && <InsertPanel />}
          {activeTab === 'ai' && <AIPanel />}
          {activeTab === 'stem' && <STEMPanel />}
          {activeTab === 'media' && <MediaPanel />}
        </div>

      </div>
    </aside>
  )
}

/* ── Tab button ──────────────────────────────────────────────── */

function PanelTab({
  id, label, active, onClick, children,
}: {
  id: string
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={active}
      className={`rpanel-tab${active ? ' active' : ''}`}
      onClick={onClick}
    >
      <span className="rpanel-tab-icon">{children}</span>
      <span className="rpanel-tab-label">{label}</span>
    </button>
  )
}

/* ── INSERT PANEL ───────────────────────────────────────────── */

function InsertPanel() {
  const [editor] = useLexicalComposerContext()

  return (
    <div className="insert-panel">
      {CATEGORY_ORDER.map(cat => {
        const blocks = BLOCK_REGISTRY.filter(b => b.category === cat)
        if (blocks.length === 0) return null
        return (
          <div key={cat} className="rpanel-block-group">
            <div className="rpanel-section-header">{CATEGORY_LABELS[cat]}</div>
            {blocks.map(block =>
              block.status === 'available' ? (
                <button
                  key={block.key}
                  type="button"
                  className="rpanel-block-btn"
                  onClick={() => block.insert(editor)}
                  title={block.description}
                >
                  <span className="rpanel-block-icon" aria-hidden="true">{block.icon}</span>
                  <span className="rpanel-block-info">
                    <span className="rpanel-block-label">{block.label}</span>
                    <span className="rpanel-block-desc">{block.description}</span>
                  </span>
                </button>
              ) : (
                <div key={block.key} className="rpanel-coming-item">
                  <span className="rpanel-block-icon" aria-hidden="true">{block.icon}</span>
                  <span className="rpanel-block-info">
                    <span className="rpanel-block-label">{block.label}</span>
                    <span className="rpanel-block-desc">{block.description}</span>
                  </span>
                  <span className="badge-soon">Soon</span>
                </div>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── AI PANEL ───────────────────────────────────────────────── */

function AIPanel() {
  const [editor] = useLexicalComposerContext()
  const service = useAIService()
  const { selectedText } = useEditorUI()
  const { status, text, blocks, error, start, cancel, reset } = useAIStream()
  const [customPrompt, setCustomPrompt] = useState('')
  const [activeCommand, setActiveCommand] = useState<AICommandId | null>(null)
  const [savedRange, setSavedRange] = useState<SavedRange | null>(null)

  function runCommand(commandId: AICommandId) {
    setActiveCommand(commandId)
    const range = REPLACE_COMMANDS.has(commandId) ? captureRange(editor) : null
    setSavedRange(range)
    const documentContext = editor.getEditorState().read(() => $getRoot().getTextContent())
    start(service, {
      commandId,
      selectedText,
      documentContext,
      customPrompt: commandId === 'custom' ? customPrompt : undefined,
    })
  }

  function handleInsert() {
    insertBlocks(editor, blocks)
    reset()
  }

  function handleReplace() {
    if (savedRange) {
      replaceSelectionWithBlocks(editor, savedRange, blocks)
    } else {
      insertBlocks(editor, blocks)
    }
    reset()
  }

  const isStreaming = status === 'streaming'
  const isDone = status === 'done'
  const hasSelection = selectedText.trim().length > 0

  return (
    <div className="rpanel-ai-panel">
      <div className="rpanel-ai-header">
        <span className="rpanel-ai-title">AI Assistant</span>
        {hasSelection && (
          <span className="rpanel-ai-selection-badge" title={selectedText}>
            Selection
          </span>
        )}
      </div>

      {/* Command buttons */}
      {status === 'idle' || status === 'error' || status === 'cancelled' ? (
        <>
          <div className="rpanel-ai-actions">
            {AI_COMMANDS.filter(c => c.id !== 'custom').map(cmd => (
              <button
                key={cmd.id}
                type="button"
                className="rpanel-ai-btn"
                disabled={cmd.requiresSelection && !hasSelection}
                title={cmd.requiresSelection && !hasSelection ? 'Select text first' : cmd.description}
                onClick={() => runCommand(cmd.id)}
              >
                <span className="rpanel-ai-btn-icon" aria-hidden="true">{cmd.icon}</span>
                {cmd.label}
              </button>
            ))}
          </div>

          {/* Custom prompt */}
          <div className="rpanel-ai-custom">
            <textarea
              className="rpanel-ai-custom-input"
              placeholder="Ask AI anything about the document…"
              rows={3}
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
            />
            <button
              type="button"
              className="rpanel-ai-btn rpanel-ai-custom-btn"
              disabled={customPrompt.trim().length === 0}
              onClick={() => runCommand('custom')}
            >
              <span className="rpanel-ai-btn-icon" aria-hidden="true">✦</span>
              Ask AI
            </button>
          </div>

          {(status === 'error' || status === 'cancelled') && (
            <div className="rpanel-ai-error">
              {error?.message ?? 'Something went wrong.'}
              <button type="button" className="rpanel-ai-retry-btn" onClick={reset}>
                Reset
              </button>
            </div>
          )}
        </>
      ) : (
        /* Streaming / done state */
        <div className="rpanel-ai-output">
          <div className="rpanel-ai-output-header">
            <span className="rpanel-ai-output-label">
              {AI_COMMANDS.find(c => c.id === activeCommand)?.label ?? 'AI'}
            </span>
            {isStreaming && (
              <button type="button" className="rpanel-ai-cancel-btn" onClick={cancel}>
                Stop
              </button>
            )}
          </div>

          <div className="rpanel-ai-output-text">
            {text || <span className="rpanel-ai-thinking">Thinking…</span>}
            {isStreaming && <span className="rpanel-ai-cursor" aria-hidden="true">▌</span>}
          </div>

          {isDone && (
            <div className="rpanel-ai-output-actions">
              {savedRange ? (
                <button type="button" className="rpanel-ai-insert-btn" onClick={handleReplace}>
                  Replace selection
                </button>
              ) : (
                <button type="button" className="rpanel-ai-insert-btn" onClick={handleInsert}>
                  Insert into document
                </button>
              )}
              {savedRange && (
                <button type="button" className="rpanel-ai-insert-btn rpanel-ai-insert-secondary" onClick={handleInsert}>
                  Insert after
                </button>
              )}
              <button type="button" className="rpanel-ai-discard-btn" onClick={reset}>
                Discard
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── STEM PANEL ─────────────────────────────────────────────── */

function STEMPanel() {
  const { activeMath, activeModel3d } = useEditorUI()
  if (activeMath) return <MathEditorPanel />
  if (activeModel3d) return <Model3DPropertiesPanel />
  return <STEMBlockInserter />
}

function STEMBlockInserter() {
  const [editor] = useLexicalComposerContext()
  const stemBlocks = BLOCK_REGISTRY.filter(b => b.category === 'stem')

  return (
    <div className="rpanel-stem-panel">
      <div className="rpanel-stem-hint">
        <span className="rpanel-stem-hint-icon" aria-hidden="true">💡</span>
        <p className="rpanel-stem-hint-text">
          Click a math or 3D model block in the editor to edit its properties here.
        </p>
      </div>
      <div className="rpanel-section-header" style={{ paddingTop: 0 }}>STEM Blocks</div>
      {stemBlocks.map(block =>
        block.status === 'available' ? (
          <button
            key={block.key}
            type="button"
            className="rpanel-block-btn"
            onClick={() => block.insert(editor)}
            title={block.description}
          >
            <span className="rpanel-block-icon" aria-hidden="true">{block.icon}</span>
            <span className="rpanel-block-info">
              <span className="rpanel-block-label">{block.label}</span>
              <span className="rpanel-block-desc">{block.description}</span>
            </span>
          </button>
        ) : (
          <div key={block.key} className="rpanel-coming-item">
            <span className="rpanel-block-icon" aria-hidden="true">{block.icon}</span>
            <span className="rpanel-block-info">
              <span className="rpanel-block-label">{block.label}</span>
              <span className="rpanel-block-desc">{block.description}</span>
            </span>
            <span className="badge-soon">Soon</span>
          </div>
        )
      )}
    </div>
  )
}

/* ── MATH EDITOR PANEL ──────────────────────────────────────── */

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
    <div className="math-editor-panel">
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

      {/* Symbol shortcuts — Math */}
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

      {/* Greek */}
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

  function patch(changes: object) {
    update({ activeModel3d: { ...activeModel3d, ...changes } })
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

  function applyDisplay(dispPatch: Partial<{ mode: Model3DDisplayMode; height: number }>) {
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
          {(['inline', 'fullwidth'] as const).map(m => (
            <button
              key={m}
              type="button"
              className={`model3d-mode-btn${display.mode === m ? ' active' : ''}`}
              onClick={() => applyDisplay({ mode: m })}
            >
              {m === 'inline' ? 'Inline' : 'Full width'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── MEDIA PANEL ────────────────────────────────────────────── */

function MediaPanel() {
  const mediaBlocks = BLOCK_REGISTRY.filter(b => b.category === 'media')

  return (
    <div className="rpanel-media-panel">
      <div className="rpanel-section-header" style={{ paddingTop: 0 }}>Media Blocks</div>
      {mediaBlocks.map(block => (
        <div key={block.key} className="rpanel-coming-item">
          <span className="rpanel-block-icon" aria-hidden="true">{block.icon}</span>
          <span className="rpanel-block-info">
            <span className="rpanel-block-label">{block.label}</span>
            <span className="rpanel-block-desc">{block.description}</span>
          </span>
          <span className="badge-soon">Soon</span>
        </div>
      ))}
    </div>
  )
}

/* ── Tab icons ──────────────────────────────────────────────── */

function InsertTabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function AITabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1.5L9.5 6.5L14.5 8L9.5 9.5L8 14.5L6.5 9.5L1.5 8L6.5 6.5Z" />
    </svg>
  )
}

function STEMTabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="1.8" fill="currentColor" />
      <ellipse cx="8" cy="8" rx="6.5" ry="2.5" stroke="currentColor" strokeWidth="1.25" />
      <ellipse cx="8" cy="8" rx="6.5" ry="2.5" stroke="currentColor" strokeWidth="1.25" transform="rotate(60 8 8)" />
      <ellipse cx="8" cy="8" rx="6.5" ry="2.5" stroke="currentColor" strokeWidth="1.25" transform="rotate(-60 8 8)" />
    </svg>
  )
}

function MediaTabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 10.5L5.5 7L8 9.5L10.5 6.5L14 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="5.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  )
}
