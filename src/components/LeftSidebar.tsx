import { useEffect, useRef, useState } from 'react'
import { useEditorUI } from '../editor/context/EditorUIContext'
import { useDocument, formatRelativeTime } from '../context/DocumentContext'
import type { OutlineItem } from '../context/DocumentContext'

interface LeftSidebarProps {
  isOpen: boolean
}

export function LeftSidebar({ isOpen }: LeftSidebarProps) {
  const [query, setQuery] = useState('')
  const {
    outline, documents, activeDocId, createDocument, switchDocument, deleteDocument,
  } = useDocument()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const filteredOutline = query
    ? outline.filter(h => h.text.toLowerCase().includes(query.toLowerCase()))
    : outline

  const sortedDocs = [...documents].sort((a, b) => {
    if (a.id === activeDocId) return -1
    if (b.id === activeDocId) return 1
    return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
  })

  function confirmDelete(id: string) {
    deleteDocument(id)
    setConfirmDeleteId(null)
  }

  return (
    <aside className={`app-sidebar-left${isOpen ? '' : ' closed'}`} aria-label="Navigator">
      <div className="lsb-inner">

        {/* Header */}
        <div className="lsb-header">
          <span className="lsb-header-icon" aria-hidden="true">📚</span>
          <span className="lsb-header-title">My Notebook</span>
        </div>

        {/* Search */}
        <div className="lsb-search">
          <div className="lsb-search-wrap">
            <span className="lsb-search-icon" aria-hidden="true"><SearchIcon /></span>
            <input
              className="lsb-search-input"
              type="search"
              placeholder="Search headings…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search headings"
            />
          </div>
        </div>

        {/* Scrollable body */}
        <div className="lsb-scroll">

          {/* Documents */}
          <div className="lsb-section">
            <div className="lsb-section-header-row">
              <div className="lsb-section-header">Documents</div>
              <button
                type="button"
                className="lsb-new-doc-btn"
                onClick={() => { createDocument(); setConfirmDeleteId(null) }}
                title="New document"
                aria-label="New document"
              >
                +
              </button>
            </div>
            <div className="lsb-doc-list">
              {sortedDocs.map(doc => {
                const isActive = doc.id === activeDocId
                const isConfirming = confirmDeleteId === doc.id
                return (
                  <div
                    key={doc.id}
                    className={`lsb-doc-item${isActive ? ' active' : ''}`}
                  >
                    <button
                      type="button"
                      className="lsb-doc-item-main"
                      onClick={() => { switchDocument(doc.id); setConfirmDeleteId(null) }}
                      title={doc.title || 'Untitled'}
                    >
                      <span className="lsb-active-doc-emoji" aria-hidden="true">🧪</span>
                      <span className="lsb-doc-item-text">
                        <span className="lsb-active-doc-title">{doc.title || 'Untitled'}</span>
                        {doc.lastSaved && (
                          <span className="lsb-doc-item-time">{formatRelativeTime(new Date(doc.lastSaved))}</span>
                        )}
                      </span>
                    </button>
                    {documents.length > 1 && (isConfirming ? (
                      <span className="lsb-doc-confirm" role="group" aria-label={`Delete ${doc.title || 'Untitled'}?`}>
                        <button type="button" className="lsb-doc-confirm-yes" autoFocus onClick={() => confirmDelete(doc.id)}>
                          Delete
                        </button>
                        <button type="button" className="lsb-doc-confirm-no" onClick={() => setConfirmDeleteId(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="lsb-doc-delete-btn"
                        onClick={() => setConfirmDeleteId(doc.id)}
                        title="Delete document"
                        aria-label="Delete document"
                      >
                        ×
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Outline */}
          <div className="lsb-section">
            <div className="lsb-section-header">Outline</div>
            {filteredOutline.length === 0 ? (
              query ? (
                <p className="lsb-empty-search">No headings match "{query}"</p>
              ) : (
                <div className="lsb-outline-empty">
                  <span className="lsb-outline-empty-glyph" aria-hidden="true">≡</span>
                  <p className="lsb-outline-empty-text">
                    Add headings to your document to build an outline
                  </p>
                </div>
              )
            ) : (
              <OutlineNav items={filteredOutline} />
            )}
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

/* ── Outline with scroll + active section ───────────────────── */

function OutlineNav({ items }: { items: OutlineItem[] }) {
  const { editor } = useEditorUI()
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Set up IntersectionObserver to highlight the heading in view
  useEffect(() => {
    if (!editor) return

    observerRef.current?.disconnect()

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const key = (entry.target as HTMLElement).dataset.lexicalNodeKey
            if (key) setActiveKey(key)
          }
        }
      },
      { rootMargin: '-10% 0px -80% 0px', threshold: 0 },
    )
    observerRef.current = obs

    for (const item of items) {
      const el = editor.getElementByKey(item.key)
      if (el) obs.observe(el)
    }

    return () => obs.disconnect()
  }, [editor, items])

  function scrollTo(key: string) {
    if (!editor) return
    const el = editor.getElementByKey(key)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveKey(key)
  }

  return (
    <nav className="lsb-outline-list" aria-label="Document outline">
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          className={`lsb-outline-item lsb-outline-${item.tag}${activeKey === item.key ? ' active' : ''}`}
          onClick={() => scrollTo(item.key)}
          title={item.text}
        >
          {item.text}
        </button>
      ))}
    </nav>
  )
}

/* ── Icons ─────────────────────────────────────────────────── */

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
