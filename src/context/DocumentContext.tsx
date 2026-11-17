import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  bootstrap,
  createDocument as createDocumentOnServer,
  deleteDocument as deleteDocumentOnServer,
  saveDocument,
  setActiveDocPointer,
} from '../storage/documentStore'
import type { DocumentRecord } from '../storage/documentStore'
import { ApiError } from '../storage/api'
import type { AiRequest } from '../storage/api'

// ── Types ───────────────────────────────────────────────────────────────────

export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

export interface OutlineItem {
  key: string
  tag: 'h1' | 'h2' | 'h3'
  text: string
}

export type DocEntry = DocumentRecord

export interface AiState {
  status: 'idle' | 'generating' | 'error'
  message: string | null
  startedAt?: number // when generation began (ms), to show elapsed time
}

/** What the editor hands over when the user saves. */
export interface DocumentSnapshot {
  state: unknown
  wordCount: number
}

export function docCorruptedBackupKey(id: string): string {
  return `lexical-doc-state-corrupted-backup:${id}`
}

// ── Context ───────────────────────────────────────────────────────────────────

interface DocumentContextValue {
  // True once the document list has loaded from the server. EditorRoot in
  // App.tsx doesn't mount the Lexical editor until this is true, so the
  // plugins never run against a not-yet-real activeDocId.
  ready: boolean
  // Set when the server couldn't be reached on load; the app has no local
  // copy to fall back on.
  loadError: string | null
  retryLoad: () => void
  title: string
  setTitle: (title: string) => void
  saveStatus: SaveStatus
  saveError: string | null
  lastSaved: Date | null
  wordCount: number
  outline: OutlineItem[]
  setOutline: (items: OutlineItem[]) => void
  setWordCount: (n: number) => void
  markDirty: () => void
  markClean: () => void
  // The editor registers how to read its current state; save() calls it.
  registerSnapshot: (fn: (() => DocumentSnapshot | null) | null) => void
  // Explicit user save (Save button / Ctrl+S). Nothing else writes.
  save: () => void
  restoreWarning: string | null
  setRestoreWarning: (message: string | null) => void
  documents: DocEntry[]
  activeDocId: string
  createDocument: () => void
  switchDocument: (id: string) => void
  deleteDocument: (id: string) => void
  // AI: creates a new document and generates its content into it.
  startAiDocument: (request: AiRequest) => void
  // For the editor of a document that was just created for AI generation.
  takeAiJob: (docId: string) => AiRequest | null
  // Whether the server has any saved content for this document (a brand-new
  // one has none, so there is nothing to stream).
  isDocSaved: (docId: string) => boolean
  aiState: AiState
  setAiState: (state: AiState) => void
  // The running generation registers its abort here; stopAi() uses it.
  aiAbortRef: { current: (() => void) | null }
  stopAi: () => void
  // True while the open document is still being streamed in from the server.
  docLoading: boolean
  setDocLoading: (loading: boolean) => void
}

const DocumentContext = createContext<DocumentContextValue>({
  ready: false,
  loadError: null,
  retryLoad: () => {},
  title: 'Untitled',
  setTitle: () => {},
  saveStatus: 'idle',
  saveError: null,
  lastSaved: null,
  wordCount: 0,
  outline: [],
  setOutline: () => {},
  setWordCount: () => {},
  markDirty: () => {},
  markClean: () => {},
  registerSnapshot: () => {},
  save: () => {},
  restoreWarning: null,
  setRestoreWarning: () => {},
  documents: [],
  activeDocId: '',
  createDocument: () => {},
  switchDocument: () => {},
  deleteDocument: () => {},
  startAiDocument: () => {},
  takeAiJob: () => null,
  isDocSaved: () => false,
  aiState: { status: 'idle', message: null },
  setAiState: () => {},
  aiAbortRef: { current: null },
  stopAi: () => {},
  docLoading: false,
  setDocLoading: () => {},
})

// ── Provider ──────────────────────────────────────────────────────────────────

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [documents, setDocuments] = useState<DocEntry[]>([])
  const [activeDocId, setActiveDocId] = useState<string>('')

  const [title, setTitleRaw] = useState<string>('Untitled')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [wordCount, setWordCount] = useState(0)
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [restoreWarning, setRestoreWarning] = useState<string | null>(null)

  // Stable refs so save()/switchDocument() always read the latest values
  // without needing to be recreated on every render.
  const titleRef = useRef(title)
  titleRef.current = title
  const activeDocIdRef = useRef(activeDocId)
  activeDocIdRef.current = activeDocId
  const documentsRef = useRef(documents)
  documentsRef.current = documents
  const saveStatusRef = useRef(saveStatus)
  saveStatusRef.current = saveStatus
  const snapshotRef = useRef<(() => DocumentSnapshot | null) | null>(null)
  // Bumped on every edit, so a save that finishes after the user kept typing
  // doesn't mark those newer edits as saved.
  const [aiState, setAiState] = useState<AiState>({ status: 'idle', message: null })
  const [docLoading, setDocLoading] = useState(false)
  const aiJobRef = useRef<{ docId: string; request: AiRequest } | null>(null)
  const aiAbortRef = useRef<(() => void) | null>(null)
  const editVersionRef = useRef(0)
  const savingRef = useRef(false)

  // Initial load from the server. Re-runs when the user presses Retry.
  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    bootstrap()
      .then(({ documents: docs, activeId }) => {
        if (cancelled) return
        setDocuments(docs)
        setActiveDocId(activeId)
        const active = docs.find(d => d.id === activeId)
        setTitleRaw(active?.title ?? 'Untitled')
        setLastSaved(active?.lastSaved ? new Date(active.lastSaved) : null)
        setWordCount(active?.wordCount ?? 0)
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not reach the server. Start the backend and try again.')
      })
    return () => { cancelled = true }
  }, [loadAttempt])

  const retryLoad = useCallback(() => setLoadAttempt(n => n + 1), [])

  const markDirty = useCallback(() => {
    editVersionRef.current++
    setSaveStatus('unsaved')
  }, [])

  // Used right after a document is opened, when loading its content itself
  // triggers an editor update that isn't a user edit.
  const markClean = useCallback(() => {
    setSaveStatus(prev => (prev === 'saving' ? prev : 'idle'))
  }, [])

  // Blocks that change their state outside the editor's own update cycle
  // (3D camera while orbiting) announce it here.
  useEffect(() => {
    window.addEventListener('tnb:dirty', markDirty)
    return () => window.removeEventListener('tnb:dirty', markDirty)
  }, [markDirty])

  const setTitle = useCallback((t: string) => {
    setTitleRaw(t)
    markDirty()
  }, [markDirty])

  const registerSnapshot = useCallback((fn: (() => DocumentSnapshot | null) | null) => {
    snapshotRef.current = fn
  }, [])

  const save = useCallback(() => {
    const snapshot = snapshotRef.current
    if (!snapshot || savingRef.current) return
    const id = activeDocIdRef.current
    const entry = documentsRef.current.find(d => d.id === id)
    if (!entry) return

    const snap = snapshot()
    if (!snap) {
      // The editor is read-only while a document loads or AI is writing into it;
      // saving now would store half a document.
      setSaveError('Wait until the document has finished loading or generating, then save.')
      return
    }
    const { state, wordCount: wc } = snap

    savingRef.current = true
    const versionAtStart = editVersionRef.current
    setSaveStatus('saving')
    setSaveError(null)
    const currentTitle = titleRef.current

    saveDocument(id, { state, title: currentTitle, wordCount: wc, baseRevision: entry.revision })
      .then(saved => {
        // Update the ref right away (not on next render) so an immediate
        // second save sends the new revision instead of a stale one.
        documentsRef.current = documentsRef.current.map(d => (d.id === id ? saved : d))
        setDocuments(documentsRef.current)
        if (id === activeDocIdRef.current) {
          setLastSaved(new Date(saved.updatedAt))
          setWordCount(wc)
          setSaveStatus(editVersionRef.current === versionAtStart ? 'saved' : 'unsaved')
        }
      })
      .catch(err => {
        const status = err instanceof ApiError ? err.status : null
        setSaveError(
          status === 409
            ? 'This document was changed somewhere else. Reload the page to get the latest copy before saving.'
            : status === 404
              ? 'This document no longer exists on the server (it may have been deleted). Copy your text into a new document.'
              : status !== null
                ? `The server could not save this document (error ${status}). Try again.`
                : 'Could not reach the server — your changes are not saved. Try again.',
        )
        setSaveStatus('error')
      })
      .finally(() => { savingRef.current = false })
  }, [])

  // Ctrl/Cmd+S saves (and stops the browser's own "save page" dialog).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [save])

  // Nothing is saved automatically, so warn before leaving with unsaved edits.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (saveStatusRef.current === 'unsaved' || saveStatusRef.current === 'error') e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  function hasUnsavedChanges(): boolean {
    return saveStatusRef.current === 'unsaved' || saveStatusRef.current === 'error'
  }

  function confirmDiscard(): boolean {
    return !hasUnsavedChanges() || window.confirm('You have unsaved changes. Discard them?')
  }

  // Shared by create/switch/delete: load a given entry's metadata as the
  // live editing state. The actual Lexical content swap happens separately
  // — AppLayout keys the editor by activeDocId so switching remounts it,
  // and InitStreamPlugin reads the new document's own content fresh.
  function activateEntry(entry: DocEntry) {
    setActiveDocPointer(entry.id)
    setActiveDocId(entry.id)
    setTitleRaw(entry.title)
    setSaveStatus('idle')
    setSaveError(null)
    setLastSaved(entry.lastSaved ? new Date(entry.lastSaved) : null)
    setWordCount(entry.wordCount)
    setOutline([])
    setRestoreWarning(null)
  }

  const createDocument = useCallback(() => {
    if (!confirmDiscard()) return
    createDocumentOnServer()
      .then(entry => {
        setDocuments(prev => [entry, ...prev])
        activateEntry(entry)
      })
      .catch(() => {
        setSaveError('Could not reach the server — the new document was not created.')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startAiDocument = useCallback((request: AiRequest) => {
    if (!confirmDiscard()) return
    createDocumentOnServer(request.title.trim() || 'Untitled')
      .then(entry => {
        setDocuments(prev => [entry, ...prev])
        aiJobRef.current = { docId: entry.id, request }
        setAiState({ status: 'idle', message: null })
        activateEntry(entry)
      })
      .catch(() => setSaveError('Could not reach the server — the new document was not created.'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const takeAiJob = useCallback((docId: string): AiRequest | null => {
    const job = aiJobRef.current
    if (!job || job.docId !== docId) return null
    aiJobRef.current = null
    return job.request
  }, [])

  const isDocSaved = useCallback(
    (docId: string) => (documentsRef.current.find(d => d.id === docId)?.revision ?? 0) > 0,
    [],
  )

  const stopAi = useCallback(() => { aiAbortRef.current?.() }, [])

  const switchDocument = useCallback((id: string) => {
    const target = documentsRef.current.find(d => d.id === id)
    if (!target || target.id === activeDocIdRef.current) return
    if (!confirmDiscard()) return
    activateEntry(target)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const deleteDocument = useCallback((id: string) => {
    deleteDocumentOnServer(id)
      .then(async () => {
        const remaining = documentsRef.current.filter(d => d.id !== id)
        if (remaining.length > 0) {
          setDocuments(remaining)
          if (id === activeDocIdRef.current) activateEntry(remaining[0])
          return
        }
        // Last document deleted — create a fresh empty one so there's always
        // at least one document open.
        const entry = await createDocumentOnServer()
        setDocuments([entry])
        activateEntry(entry)
      })
      .catch(() => {
        setSaveError('Could not reach the server — the document was not deleted.')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <DocumentContext.Provider
      value={{
        ready,
        loadError,
        retryLoad,
        title,
        setTitle,
        saveStatus,
        saveError,
        lastSaved,
        wordCount,
        outline,
        setOutline,
        setWordCount,
        markDirty,
        markClean,
        registerSnapshot,
        save,
        restoreWarning,
        setRestoreWarning,
        documents,
        activeDocId,
        createDocument,
        switchDocument,
        deleteDocument,
        startAiDocument,
        takeAiJob,
        isDocSaved,
        aiState,
        setAiState,
        aiAbortRef,
        stopAi,
        docLoading,
        setDocLoading,
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
