import { useState } from 'react'

interface Page {
  id: string
  emoji: string
  title: string
}

interface RecentItem {
  id: string
  title: string
  ago: string
}

const PAGES: Page[] = [
  { id: '1', emoji: '🧪', title: 'Introduction to Chemistry' },
  { id: '2', emoji: '📋', title: 'Periodic Table' },
  { id: '3', emoji: '⚗️', title: 'Chemical Bonds' },
  { id: '4', emoji: '🌡️', title: 'Thermodynamics' },
  { id: '5', emoji: '🌿', title: 'Organic Chemistry' },
]

const RECENT: RecentItem[] = [
  { id: '1', title: 'Introduction to Chemistry', ago: 'Just now' },
  { id: '3', title: 'Chemical Bonds', ago: '2 days ago' },
]

interface LeftSidebarProps {
  isOpen: boolean
}

export function LeftSidebar({ isOpen }: LeftSidebarProps) {
  const [activePage, setActivePage] = useState('1')
  const [query, setQuery] = useState('')

  const filteredPages = query
    ? PAGES.filter(p => p.title.toLowerCase().includes(query.toLowerCase()))
    : PAGES

  return (
    <aside className={`app-sidebar-left${isOpen ? '' : ' closed'}`} aria-label="Navigator">
      <div className="lsb-inner">

        {/* Header */}
        <div className="lsb-header">
          <span className="lsb-header-icon" aria-hidden="true">📚</span>
          <span className="lsb-header-title">My Notebook</span>
          <button type="button" className="icon-btn lsb-new-btn" title="New page" aria-label="New page">
            <PlusIcon />
          </button>
        </div>

        {/* Search */}
        <div className="lsb-search">
          <div className="lsb-search-wrap">
            <span className="lsb-search-icon" aria-hidden="true"><SearchIcon /></span>
            <input
              className="lsb-search-input"
              type="search"
              placeholder="Search pages…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search pages"
            />
          </div>
        </div>

        {/* Scrollable body */}
        <div className="lsb-scroll">

          {/* Pages */}
          <div className="lsb-section">
            <div className="lsb-section-header">Pages</div>
            {filteredPages.map(page => (
              <button
                key={page.id}
                type="button"
                className={`lsb-page-item${activePage === page.id ? ' active' : ''}`}
                onClick={() => setActivePage(page.id)}
                aria-current={activePage === page.id ? 'page' : undefined}
              >
                <span className="lsb-page-emoji" aria-hidden="true">{page.emoji}</span>
                <span className="lsb-page-title">{page.title}</span>
              </button>
            ))}
            {filteredPages.length === 0 && (
              <p className="lsb-empty-search">No results for "{query}"</p>
            )}
          </div>

          {/* Outline */}
          <div className="lsb-section">
            <div className="lsb-section-header">Outline</div>
            <div className="lsb-outline-empty">
              <span className="lsb-outline-empty-glyph" aria-hidden="true">≡</span>
              <p className="lsb-outline-empty-text">
                Add headings to your document to build an outline
              </p>
            </div>
          </div>

          {/* Recent */}
          <div className="lsb-section">
            <div className="lsb-section-header">Recent</div>
            {RECENT.map(item => (
              <button
                key={item.id}
                type="button"
                className="lsb-history-item"
                onClick={() => setActivePage(item.id)}
              >
                <span className="lsb-history-dot" aria-hidden="true" />
                <span className="lsb-history-title">{item.title}</span>
                <span className="lsb-history-time">{item.ago}</span>
              </button>
            ))}
          </div>

          {/* Versions */}
          <div className="lsb-section">
            <div className="lsb-section-header">Version history</div>
            <div className="lsb-versions-placeholder">
              <span className="lsb-versions-text">
                Version history will appear here
              </span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="lsb-footer">
          <button type="button" className="lsb-settings-btn">
            <SettingsIcon />
            <span>Settings</span>
          </button>
        </div>

      </div>
    </aside>
  )
}

/* ── Icons ─────────────────────────────────────────────────── */

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.3" />
      <line x1="8.3" y1="8.3" x2="11.5" y2="11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.01 10.01l1.06 1.06M2.93 11.07l1.06-1.06M10.01 3.99l1.06-1.06"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}
