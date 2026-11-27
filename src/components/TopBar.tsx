import { useEffect, useRef, useState } from 'react'
import { UNDO_COMMAND, REDO_COMMAND } from 'lexical'
import { useEditorUI } from '../editor/context/EditorUIContext'
import { useEditorFormat } from '../editor/context/EditorFormatContext'
import { useDocument, formatRelativeTime } from '../context/DocumentContext'
import { useTheme } from '../context/ThemeContext'
import { PreviewModal } from './PreviewModal'
import { downloadDocumentHtml } from '../editor/exportHtml'
import { downloadDocumentPdf } from '../editor/exportPdf'

interface TopBarProps {
  leftOpen: boolean
  onToggleLeft: () => void
}

function useElapsedSeconds(since: number | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since === undefined) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [since])
  return since === undefined ? 0 : Math.max(0, Math.floor((now - since) / 1000))
}

export function TopBar({ leftOpen, onToggleLeft }: TopBarProps) {
  const { editor, update: updateUI } = useEditorUI()
  const { theme, toggle: toggleTheme } = useTheme()
  const { canUndo, canRedo } = useEditorFormat()
  const { title, saveStatus, saveError, save, lastSaved, aiState, stopAi, docLoading } = useDocument()
  const aiSeconds = useElapsedSeconds(aiState.status === 'generating' ? aiState.startedAt : undefined)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  // An AI error stays in the bar only for a few seconds, unless clicked away sooner.
  const [errorVisible, setErrorVisible] = useState(true)
  useEffect(() => {
    setErrorVisible(true)
    const t = setTimeout(() => setErrorVisible(false), 6000)
    return () => clearTimeout(t)
  }, [aiState.message])
  const [pdfError, setPdfError] = useState<string | null>(null)
  const pdfErrorTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(pdfErrorTimer.current), [])
  const [shareOpen, setShareOpen] = useState(false)
  const shareRef = useRef<HTMLDivElement>(null)

  // The Share menu closes on an outside click or Escape.
  useEffect(() => {
    if (!shareOpen) return
    const onDown = (e: PointerEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) setShareOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShareOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [shareOpen])

  async function exportAsHtml() {
    setShareOpen(false)
    if (!editor) return
    try {
      await downloadDocumentHtml(editor, title)
    } catch (err) {
      console.error('HTML export failed', err)
    }
  }

  async function exportAsPdf() {
    setShareOpen(false)
    if (!editor || pdfBusy) return
    setPdfBusy(true)
    setPdfError(null)
    try {
      await downloadDocumentPdf(editor, title)
    } catch (err) {
      console.error('PDF export failed', err)
      setPdfError(err instanceof Error ? err.message : 'Could not build the PDF.')
      window.clearTimeout(pdfErrorTimer.current)
      pdfErrorTimer.current = window.setTimeout(() => setPdfError(null), 6000)
    } finally {
      setPdfBusy(false)
    }
  }

  const saveLabel =
    saveStatus === 'saving'  ? 'Saving…' :
    saveStatus === 'saved'   ? (lastSaved ? `Saved ${formatRelativeTime(lastSaved)}` : 'Saved') :
    saveStatus === 'unsaved' ? 'Unsaved changes' :
    saveStatus === 'error'   ? 'Not saved' :
    ''

  const saveDotClass =
    saveStatus === 'saving'  ? 'topbar-save-dot saving' :
    saveStatus === 'saved'   ? 'topbar-save-dot saved' :
    saveStatus === 'unsaved' ? 'topbar-save-dot unsaved' :
    saveStatus === 'error'   ? 'topbar-save-dot unsaved' :
    'topbar-save-dot'

  return (
    <header className="app-topbar">
      <div className="topbar-left">
        <button
          type="button"
          className={`icon-btn${leftOpen ? ' active' : ''}`}
          onClick={onToggleLeft}
          title={leftOpen ? 'Close navigator' : 'Open navigator'}
          aria-label={leftOpen ? 'Close navigator' : 'Open navigator'}
          aria-pressed={leftOpen}
        >
          <SidebarLeftIcon />
        </button>

        <span className="topbar-divider" aria-hidden="true" />

        <nav className="topbar-breadcrumb" aria-label="Document location">
          <span className="topbar-crumb-subject">Editor</span>
          <span className="topbar-crumb-sep" aria-hidden="true">/</span>
          <span className="topbar-crumb-title">{title || 'Untitled'}</span>
        </nav>
      </div>

      {/* Flexible spacer: pushes the right-hand controls to the far edge. */}
      <div className="topbar-center" />

      <div className="topbar-right">
        {saveLabel && (
          <span className="topbar-save-status" aria-live="polite">
            <span className={saveDotClass} aria-hidden="true" />
            {saveLabel}
          </span>
        )}
        {saveError && (
          <span className="topbar-sync-status conflict" role="alert">{saveError}</span>
        )}

        <button
          type="button"
          className="topbar-ai-open"
          disabled={!editor || docLoading}
          onClick={() => updateUI({ agent: { id: Date.now() }, activeMath: null, activeModel3d: null })}
          title="Open the AI assistant to edit this document"
          aria-label="Open AI assistant"
        >
          ✨ AI
        </button>

        <button
          type="button"
          className="icon-btn"
          disabled={!editor || docLoading}
          onClick={() => setPreviewOpen(true)}
          title="Preview document"
          aria-label="Preview document"
        >
          <PreviewIcon />
        </button>

        <button
          type="button"
          className="icon-btn"
          disabled={!canUndo}
          title="Undo (⌘Z)"
          aria-label="Undo"
          onClick={() => editor?.dispatchCommand(UNDO_COMMAND, undefined)}
        >
          <UndoIcon />
        </button>

        <button
          type="button"
          className="icon-btn"
          disabled={!canRedo}
          title="Redo (⌘⇧Z)"
          aria-label="Redo"
          onClick={() => editor?.dispatchCommand(REDO_COMMAND, undefined)}
        >
          <RedoIcon />
        </button>

        {docLoading && aiState.status !== 'generating' && (
          <span className="topbar-ai-status" role="status">Loading document…</span>
        )}
        {aiState.status === 'generating' && (
          <span className="topbar-ai-status" role="status">
            Generating… {aiSeconds}s
            <button type="button" className="topbar-ai-stop" onClick={stopAi}>Stop</button>
          </span>
        )}
        {aiState.status === 'error' && aiState.message && errorVisible && (
          <span className="topbar-sync-status conflict" role="alert" title="Click to dismiss" onClick={() => setErrorVisible(false)}>{aiState.message}</span>
        )}

        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        <span className="topbar-divider" aria-hidden="true" />

        <div className="topbar-share-wrap" ref={shareRef}>
          <button
            type="button"
            className="topbar-secondary-btn"
            aria-haspopup="menu"
            aria-expanded={shareOpen}
            onClick={() => setShareOpen(o => !o)}
          >
            Share
          </button>
          {shareOpen && (
            <div className="topbar-share-menu" role="menu" aria-label="Share">
              <button type="button" role="menuitem" className="topbar-share-item" disabled={pdfBusy} onClick={exportAsPdf}>
                Export as PDF
              </button>
              <button type="button" role="menuitem" className="topbar-share-item" onClick={exportAsHtml}>
                Export as HTML
              </button>
            </div>
          )}
        </div>

        {/* Save is the one primary action, kept at the far right. */}
        <button
          type="button"
          className="topbar-share-btn"
          disabled={saveStatus === 'saving' || saveStatus === 'idle' || saveStatus === 'saved' || aiState.status === 'generating' || docLoading}
          onClick={save}
          title={aiState.status === 'generating' ? 'Wait for the AI to finish, then save' : 'Save (Ctrl+S)'}
        >
          {saveStatus === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </div>

      {previewOpen && editor && (
        <PreviewModal sourceEditor={editor} title={title} onClose={() => setPreviewOpen(false)} />
      )}
      {(pdfBusy || pdfError) && (
        <div className="topbar-toast" role="status">{pdfBusy ? 'Building PDF…' : pdfError}</div>
      )}
    </header>
  )
}

/* ── Icons ─────────────────────────────────────────────────── */

function SidebarLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="6" y1="2.75" x2="6" y2="13.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function PreviewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M3.5 6.5H9a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <polyline points="5.5,3.5 2.5,6.5 5.5,9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RedoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M11.5 6.5H6a3.5 3.5 0 0 0 0 7h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <polyline points="9.5,3.5 12.5,6.5 9.5,9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z" />
    </svg>
  )
}
