import type { ReactNode } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { BLOCK_REGISTRY } from '../editor/blockRegistry'

export type RightTab = 'insert' | 'ai' | 'stem' | 'media'

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

const CATEGORY_LABELS: Record<string, string> = {
  text: 'Text Blocks',
  chemistry: 'Chemistry',
}

function InsertPanel() {
  const [editor] = useLexicalComposerContext()
  const categories = Array.from(new Set(BLOCK_REGISTRY.map(b => b.category)))

  return (
    <div className="insert-panel">
      {categories.map(cat => {
        const blocks = BLOCK_REGISTRY.filter(b => b.category === cat)
        return (
          <div key={cat} className="rpanel-block-group">
            <div className="rpanel-section-header">
              {CATEGORY_LABELS[cat] ?? cat}
            </div>
            {blocks.map(block => (
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
            ))}
          </div>
        )
      })}
    </div>
  )
}

/* ── AI PANEL ───────────────────────────────────────────────── */

function AIPanel() {
  return (
    <div className="rpanel-ai-panel">
      <div className="rpanel-ai-header">
        <span className="rpanel-ai-title">AI Assistant</span>
        <span className="badge-soon">Phase 4</span>
      </div>

      <div className="rpanel-ai-empty">
        <span className="rpanel-ai-glyph" aria-hidden="true">✦</span>
        <p className="rpanel-ai-desc">
          Select text in the editor to transform it, or generate new content for your document.
        </p>
      </div>

      <div className="rpanel-ai-actions">
        {[
          { icon: '✦', label: 'Generate content…' },
          { icon: '✎', label: 'Explain selection' },
          { icon: '≡', label: 'Summarise document' },
          { icon: '❓', label: 'Create quiz from selection' },
        ].map(action => (
          <button key={action.label} type="button" className="rpanel-ai-btn" disabled>
            <span className="rpanel-ai-btn-icon" aria-hidden="true">{action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── STEM PANEL ─────────────────────────────────────────────── */

function STEMPanel() {
  const [editor] = useLexicalComposerContext()

  const equationBlock = BLOCK_REGISTRY.find(b => b.key === 'equation')
  const moleculeBlock = BLOCK_REGISTRY.find(b => b.key === 'molecule3d')

  return (
    <div className="rpanel-stem-panel">

      <div className="rpanel-section-header" style={{ paddingTop: 0 }}>Chemistry</div>

      {equationBlock && (
        <button type="button" className="rpanel-block-btn" onClick={() => equationBlock.insert(editor)}>
          <span className="rpanel-block-icon" aria-hidden="true">{equationBlock.icon}</span>
          <span className="rpanel-block-info">
            <span className="rpanel-block-label">{equationBlock.label}</span>
            <span className="rpanel-block-desc">{equationBlock.description}</span>
          </span>
        </button>
      )}

      {moleculeBlock && (
        <button type="button" className="rpanel-block-btn" onClick={() => moleculeBlock.insert(editor)}>
          <span className="rpanel-block-icon" aria-hidden="true">{moleculeBlock.icon}</span>
          <span className="rpanel-block-info">
            <span className="rpanel-block-label">{moleculeBlock.label}</span>
            <span className="rpanel-block-desc">{moleculeBlock.description}</span>
          </span>
        </button>
      )}

      <div className="rpanel-section-header">Math &amp; Equations</div>

      <div className="rpanel-coming-item">
        <span className="rpanel-block-icon" aria-hidden="true">Σ</span>
        <span className="rpanel-block-info">
          <span className="rpanel-block-label">Math Equation</span>
          <span className="rpanel-block-desc">LaTeX / KaTeX expression</span>
        </span>
        <span className="badge-soon">Soon</span>
      </div>

      <div className="rpanel-section-header">Visualizations</div>

      {[
        { icon: '📊', label: 'Diagram', desc: 'Concept map, flowchart' },
        { icon: '🔬', label: 'Simulation', desc: 'Interactive physics / chemistry' },
      ].map(item => (
        <div key={item.label} className="rpanel-coming-item">
          <span className="rpanel-block-icon" aria-hidden="true">{item.icon}</span>
          <span className="rpanel-block-info">
            <span className="rpanel-block-label">{item.label}</span>
            <span className="rpanel-block-desc">{item.desc}</span>
          </span>
          <span className="badge-soon">Soon</span>
        </div>
      ))}

    </div>
  )
}

/* ── MEDIA PANEL ────────────────────────────────────────────── */

function MediaPanel() {
  const ITEMS = [
    { icon: '🖼', label: 'Image', desc: 'JPEG, PNG, WebP, SVG' },
    { icon: '🎥', label: 'Video', desc: 'MP4, WebM' },
    { icon: '🔊', label: 'Audio', desc: 'MP3, WAV, OGG' },
    { icon: '📎', label: 'File', desc: 'Any file type' },
    { icon: '🔗', label: 'Embed', desc: 'URL or iframe' },
  ]

  return (
    <div className="rpanel-media-panel">
      <div className="rpanel-section-header" style={{ paddingTop: 0 }}>Media</div>
      {ITEMS.map(item => (
        <div key={item.label} className="rpanel-coming-item">
          <span className="rpanel-block-icon" aria-hidden="true">{item.icon}</span>
          <span className="rpanel-block-info">
            <span className="rpanel-block-label">{item.label}</span>
            <span className="rpanel-block-desc">{item.desc}</span>
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
