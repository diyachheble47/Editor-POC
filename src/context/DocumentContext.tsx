import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'

// ── Types ───────────────────────────────────────────────────────────────────

export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved'

export interface OutlineItem {
  key: string
  tag: 'h1' | 'h2' | 'h3'
  text: string
}

export interface VersionEntry {
  id: string
  title: string
  savedAt: string   // ISO string
  editorStateJson: string
}

// ── Storage ──────────────────────────────────────────────────────────────────

const DOC_META_KEY = 'tnb-doc-meta'
const VERSIONS_KEY = 'tnb-versions'
const MAX_VERSIONS = 10

interface StoredMeta {
  title: string
  lastSaved: string
  wordCount: number
}

function readMeta(): StoredMeta | null {
  try {
    const raw = localStorage.getItem(DOC_META_KEY)
    return raw ? (JSON.parse(raw) as StoredMeta) : null
  } catch {
    return null
  }
}

function readVersions(): VersionEntry[] {
  try {
    const raw = localStorage.getItem(VERSIONS_KEY)
    return raw ? (JSON.parse(raw) as VersionEntry[]) : []
  } catch {
    return []
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface DocumentContextValue {
  title: string
  setTitle: (title: string) => void
  saveStatus: SaveStatus
  lastSaved: Date | null
  wordCount: number
  outline: OutlineItem[]
  versions: VersionEntry[]
  setOutline: (items: OutlineItem[]) => void
  setWordCount: (n: number) => void
  markDirty: () => void
  save: (editorStateJson: string, wc: number) => void
}

const DocumentContext = createContext<DocumentContextValue>({
  title: 'Untitled',
  setTitle: () => {},
  saveStatus: 'idle',
  lastSaved: null,
  wordCount: 0,
  outline: [],
  versions: [],
  setOutline: () => {},
  setWordCount: () => {},
  markDirty: () => {},
  save: () => {},
})

// ── Provider ──────────────────────────────────────────────────────────────────

export function DocumentProvider({ children }: { children: ReactNode }) {
  const meta = readMeta()

  const [title, setTitleRaw] = useState<string>(meta?.title ?? 'Introduction to Chemistry')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(meta ? 'saved' : 'idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(
    meta?.lastSaved ? new Date(meta.lastSaved) : null,
  )
  const [wordCount, setWordCount] = useState(meta?.wordCount ?? 0)
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [versions, setVersions] = useState<VersionEntry[]>(readVersions)

  // Stable ref so save() can always read the latest title without rebuilding
  const titleRef = useRef(title)
  titleRef.current = title

  const setTitle = useCallback((t: string) => {
    setTitleRaw(t)
    setSaveStatus('unsaved')
  }, [])

  const markDirty = useCallback(() => {
    setSaveStatus('unsaved')
  }, [])

  const save = useCallback((editorStateJson: string, wc: number) => {
    setSaveStatus('saving')
    const now = new Date()
    const currentTitle = titleRef.current

    try {
      const meta: StoredMeta = {
        title: currentTitle,
        lastSaved: now.toISOString(),
        wordCount: wc,
      }
      localStorage.setItem(DOC_META_KEY, JSON.stringify(meta))

      // Version snapshot
      const entry: VersionEntry = {
        id: now.toISOString(),
        title: currentTitle,
        savedAt: now.toISOString(),
        editorStateJson,
      }
      setVersions(prev => {
        const next = [entry, ...prev].slice(0, MAX_VERSIONS)
        try { localStorage.setItem(VERSIONS_KEY, JSON.stringify(next)) } catch { /* quota */ }
        return next
      })

      setLastSaved(now)
      setWordCount(wc)
      setSaveStatus('saved')
    } catch {
      setSaveStatus('unsaved')
    }
  }, [])

  return (
    <DocumentContext.Provider
      value={{
        title,
        setTitle,
        saveStatus,
        lastSaved,
        wordCount,
        outline,
        versions,
        setOutline,
        setWordCount,
        markDirty,
        save,
      }}
    >
      {children}
    </DocumentContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDocument() {
  return useContext(DocumentContext)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 10) return 'Just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return date.toLocaleDateString()
}
