import { UNDO_COMMAND, REDO_COMMAND } from 'lexical'
import { useEditorUI } from '../editor/context/EditorUIContext'
import { useDocument, formatRelativeTime } from '../context/DocumentContext'

interface TopBarProps {
  leftOpen: boolean
  rightOpen: boolean
  onToggleLeft: () => void
  onToggleRight: () => void
}

export function TopBar({ leftOpen, rightOpen, onToggleLeft, onToggleRight }: TopBarProps) {
  const { editor, canUndo, canRedo } = useEditorUI()
  const { title, saveStatus, lastSaved, wordCount } = useDocument()

  const saveLabel =
    saveStatus === 'saving'  ? 'Saving…' :
    saveStatus === 'saved'   ? (lastSaved ? `Saved ${formatRelativeTime(lastSaved)}` : 'Saved') :
    saveStatus === 'unsaved' ? 'Unsaved changes' :
    ''

  const saveDotClass =
    saveStatus === 'saving'  ? 'topbar-save-dot saving' :
    saveStatus === 'saved'   ? 'topbar-save-dot saved' :
    saveStatus === 'unsaved' ? 'topbar-save-dot unsaved' :
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
          <span className="topbar-crumb-subject">Notebook</span>
          <span className="topbar-crumb-sep" aria-hidden="true">/</span>
          <span className="topbar-crumb-title">{title || 'Untitled'}</span>
        </nav>
      </div>

      <div className="topbar-center">
        {wordCount > 0 && (
          <span className="topbar-wordcount" aria-label={`${wordCount} words`}>
            {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
          </span>
        )}
      </div>

      <div className="topbar-right">
        {saveLabel && (
          <span className="topbar-save-status" aria-live="polite">
            <span className={saveDotClass} aria-hidden="true" />
            {saveLabel}
          </span>
        )}

        <span className="topbar-divider" aria-hidden="true" />

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

        <span className="topbar-divider" aria-hidden="true" />

        <button type="button" className="topbar-share-btn">
          Share
        </button>

        <button
          type="button"
          className={`icon-btn${rightOpen ? ' active' : ''}`}
          onClick={onToggleRight}
          title={rightOpen ? 'Close tools panel' : 'Open tools panel'}
          aria-label={rightOpen ? 'Close tools panel' : 'Open tools panel'}
          aria-pressed={rightOpen}
        >
          <SidebarRightIcon />
        </button>
      </div>
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

function SidebarRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10" y1="2.75" x2="10" y2="13.25" stroke="currentColor" strokeWidth="1.5" />
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
