import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { DocumentRecord } from '../storage/db'
import {
  bootstrap,
  createDocumentRecord,
  deleteDocumentRecord,
  setActiveDocPointer,
  updateDocumentMeta,
} from '../storage/documentRepo'

// ── Types ───────────────────────────────────────────────────────────────────

export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved'

export interface OutlineItem {
  key: string
  tag: 'h1' | 'h2' | 'h3'
  text: string
}

// The document list/metadata type is now the Dexie record shape directly
// (see src/storage/db.ts) — kept as an alias so existing imports of
// `DocEntry` (none outside this file today, but harmless to keep) still
// resolve.
export type DocEntry = DocumentRecord

export function docCorruptedBackupKey(id: string): string {
  return `lexical-doc-state-corrupted-backup:${id}`
}

// ── Context ───────────────────────────────────────────────────────────────────

interface DocumentContextValue {
  // True once the initial Dexie bootstrap (including one-time migration off
  // the old localStorage scheme, if needed) has resolved. EditorRoot in
  // App.tsx doesn't mount the Lexical editor until this is true, so
  // InitStreamPlugin/AutoSavePlugin never run against a not-yet-real
  // activeDocId.
  ready: boolean
  title: string
  setTitle: (title: string) => void
  saveStatus: SaveStatus
  lastSaved: Date | null
  wordCount: number
  outline: OutlineItem[]
  setOutline: (items: OutlineItem[]) => void
  setWordCount: (n: number) => void
  markDirty: () => void
  save: (wc: number) => void
  restoreWarning: string | null
  setRestoreWarning: (message: string | null) => void
  documents: DocEntry[]
  activeDocId: string
  activeDocSeedDemo: boolean
  createDocument: () => void
  switchDocument: (id: string) => void
  deleteDocument: (id: string) => void
}

const DocumentContext = createContext<DocumentContextValue>({
  ready: false,
  title: 'Untitled',
  setTitle: () => {},
  saveStatus: 'idle',
  lastSaved: null,
  wordCount: 0,
  outline: [],
  setOutline: () => {},
  setWordCount: () => {},
  markDirty: () => {},
  save: () => {},
  restoreWarning: null,
  setRestoreWarning: () => {},
  documents: [],
  activeDocId: '',
  activeDocSeedDemo: false,
  createDocument: () => {},
  switchDocument: () => {},
  deleteDocument: () => {},
})

// ── Provider ──────────────────────────────────────────────────────────────────

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [documents, setDocuments] = useState<DocEntry[]>([])
  const [activeDocId, setActiveDocId] = useState<string>('')

  const [title, setTitleRaw] = useState<string>('Untitled')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [wordCount, setWordCount] = useState(0)
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [restoreWarning, setRestoreWarning] = useState<string | null>(null)
  const [activeDocSeedDemo, setActiveDocSeedDemo] = useState(false)

  // Stable refs so save()/switchDocument() always read the latest values
  // without needing to be recreated on every render.
  const titleRef = useRef(title)
  titleRef.current = title
  const activeDocIdRef = useRef(activeDocId)
  activeDocIdRef.current = activeDocId

  // One-time async bootstrap: read Dexie, migrating off the old localStorage
  // scheme first if Dexie is empty (documentRepo.bootstrap handles both).
  // A ref guards against React StrictMode's dev-only double-invoke running
  // the bootstrap/migration twice.
  const bootstrapped = useRef(false)
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    bootstrap().then(({ documents: docs, activeId }) => {
      setDocuments(docs)
      setActiveDocId(activeId)
      const active = docs.find(d => d.id === activeId)
      setTitleRaw(active?.title ?? 'Untitled')
      setLastSaved(active?.lastSaved ? new Date(active.lastSaved) : null)
      setWordCount(active?.wordCount ?? 0)
      setActiveDocSeedDemo(active?.seedDemo ?? false)
      setReady(true)
    })
  }, [])

  const setTitle = useCallback((t: string) => {
    setTitleRaw(t)
    setSaveStatus('unsaved')
  }, [])

  const markDirty = useCallback(() => {
    setSaveStatus('unsaved')
  }, [])

  const save = useCallback((wc: number) => {
    setSaveStatus('saving')
    const now = new Date()
    const id = activeDocIdRef.current
    const currentTitle = titleRef.current

    updateDocumentMeta(id, { title: currentTitle, lastSaved: now.toISOString(), wordCount: wc })
      .then(() => {
        setDocuments(prev => prev.map(d =>
          d.id === id ? { ...d, title: currentTitle, lastSaved: now.toISOString(), wordCount: wc } : d,
        ))
        setLastSaved(now)
        setWordCount(wc)
        setSaveStatus('saved')
      })
      .catch(() => setSaveStatus('unsaved'))
  }, [])

  // Shared by create/switch/delete: load a given entry's metadata as the
  // live editing state. The actual Lexical content swap happens separately
  // — AppLayout keys the editor by activeDocId so switching remounts it,
  // and InitStreamPlugin reads the new document's own segment fresh.
  function activateEntry(entry: DocEntry) {
    setActiveDocPointer(entry.id)
    setActiveDocId(entry.id)
    setTitleRaw(entry.title)
    setSaveStatus('idle')
    setLastSaved(entry.lastSaved ? new Date(entry.lastSaved) : null)
    setWordCount(entry.wordCount)
    setOutline([])
    setRestoreWarning(null)
    setActiveDocSeedDemo(entry.seedDemo ?? false)
  }

  const createDocument = useCallback(() => {
    createDocumentRecord().then(entry => {
      setDocuments(prev => [entry, ...prev])
      activateEntry(entry)
    })
  }, [])

  const switchDocument = useCallback((id: string) => {
    setDocuments(prev => {
      const target = prev.find(d => d.id === id)
      if (target && target.id !== activeDocIdRef.current) activateEntry(target)
      return prev
    })
  }, [])

  const deleteDocument = useCallback((id: string) => {
    deleteDocumentRecord(id).then(async () => {
      const remaining = documents.filter(d => d.id !== id)
      if (remaining.length > 0) {
        setDocuments(remaining)
        if (id === activeDocIdRef.current) activateEntry(remaining[0])
        return
      }
      // Last document deleted — create a fresh empty one so there's always
      // at least one document open.
      const entry = await createDocumentRecord()
      setDocuments([entry])
      activateEntry(entry)
    })
  }, [documents])

  return (
    <DocumentContext.Provider
      value={{
        ready,
        title,
        setTitle,
        saveStatus,
        lastSaved,
        wordCount,
        outline,
        setOutline,
        setWordCount,
        markDirty,
        save,
        restoreWarning,
        setRestoreWarning,
        documents,
        activeDocId,
        activeDocSeedDemo,
        createDocument,
        switchDocument,
        deleteDocument,
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
