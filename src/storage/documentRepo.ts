// Document/segment persistence, backed by the Dexie schema in db.ts.
//
// This replaces DocumentContext.tsx's previous localStorage-only scheme
// (Task 2 of TASKS.md: `tnb-doc-index` + per-doc `lexical-doc-state:<id>`
// keys) as the primary store. DocumentContext.tsx stays the React-facing
// API (same shape as before for its consumers); this module owns the actual
// reads/writes and the one-time migration off the old localStorage keys.
//
// Content is stored as a single "segment 0" per document for now
// (`documentSegments` with order 0, heading null) rather than a field on
// the document record itself — today's one-blob-per-document model is just
// the one-segment case of the segmented model the extension plan's Phase C
// introduces, so no further migration is needed when segmentation lands.
//
// The corrupted-backup-on-restore-failure safety net (TASKS.md Task 1)
// still uses localStorage directly (via docCorruptedBackupKey in
// DocumentContext.tsx) — it's a rare manual-recovery path, not primary
// storage, and moving it isn't in scope here.
import { db } from './db'
import type { DocumentRecord } from './db'

const ACTIVE_DOC_KEY = 'tnb-active-doc-id' // small pointer only, not bulk content
const LEGACY_INDEX_KEY = 'tnb-doc-index'
const LEGACY_META_KEY = 'tnb-doc-meta'
const LEGACY_STATE_KEY = 'lexical-doc-state'

export const DOC_SCHEMA_VERSION = 1
// B0 decision: no real auth yet — every document is owned by this fixed
// local-user stub. Swapping in real accounts later changes how this value
// is obtained, not the schema/API shape around it.
export const LOCAL_OWNER_ID = 'local-user'

function genId(): string {
  return `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function segmentIdFor(docId: string): string {
  return `${docId}:0`
}

interface LegacyDocEntry {
  id: string
  title: string
  lastSaved: string | null
  wordCount: number
  seedDemo?: boolean
}

function nowIso(): string {
  return new Date().toISOString()
}

function toDocumentRecord(entry: LegacyDocEntry): DocumentRecord {
  const ts = entry.lastSaved ?? nowIso()
  return {
    id: entry.id,
    title: entry.title,
    createdAt: ts,
    updatedAt: ts,
    schemaVersion: DOC_SCHEMA_VERSION,
    syncStatus: 'local',
    wordCount: entry.wordCount,
    lastSaved: entry.lastSaved,
    seedDemo: entry.seedDemo,
    ownerId: LOCAL_OWNER_ID,
    revision: 0,
  }
}

// Deliberately permissive: this parses a pre-Dexie saved blob (either the
// `{version,state}` envelope from Task 7, or an unwrapped raw Lexical
// SerializedEditorState from before that) into the plain object Dexie will
// store as the segment's `state` field going forward.
function unwrapLegacyState(raw: string): unknown {
  const parsed: unknown = JSON.parse(raw)
  if (parsed && typeof parsed === 'object' && 'version' in parsed && 'state' in parsed) {
    return (parsed as { state: unknown }).state
  }
  return parsed
}

// One-time migration off the previous localStorage scheme into Dexie. Old
// keys are left in place (not cleared) — per the spec's migration rule,
// legacy storage is only removed once the migration has been verified
// (EXTENSION_PLAN.md Phase E2), not as part of writing the new copy.
async function migrateFromLocalStorage(): Promise<DocumentRecord[]> {
  const entries: LegacyDocEntry[] = []

  let legacyIndexRaw: string | null = null
  try {
    legacyIndexRaw = localStorage.getItem(LEGACY_INDEX_KEY)
  } catch {
    legacyIndexRaw = null
  }

  if (legacyIndexRaw) {
    try {
      const parsed = JSON.parse(legacyIndexRaw) as LegacyDocEntry[]
      if (Array.isArray(parsed)) entries.push(...parsed)
    } catch {
      // fall through to the older flat-key path below
    }
  }

  if (entries.length === 0) {
    // Even older shape (pre-Task-2): a single unkeyed document under
    // `tnb-doc-meta` + `lexical-doc-state`.
    type LegacyMeta = { title: string; lastSaved: string; wordCount: number }
    let legacyMeta: LegacyMeta | null = null
    try {
      const raw = localStorage.getItem(LEGACY_META_KEY)
      legacyMeta = raw ? (JSON.parse(raw) as LegacyMeta) : null
    } catch {
      legacyMeta = null
    }
    const legacyState = localStorage.getItem(LEGACY_STATE_KEY)

    if (legacyMeta || legacyState) {
      entries.push({
        id: genId(),
        title: legacyMeta?.title ?? 'Introduction to Chemistry',
        lastSaved: legacyMeta?.lastSaved ?? null,
        wordCount: legacyMeta?.wordCount ?? 0,
      })
    }
  }

  if (entries.length === 0) {
    // Completely fresh install — no Dexie data, no legacy localStorage data.
    const fresh: DocumentRecord = {
      id: genId(),
      title: 'Introduction to Chemistry',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      schemaVersion: DOC_SCHEMA_VERSION,
      syncStatus: 'local',
      wordCount: 0,
      lastSaved: null,
      seedDemo: true,
      ownerId: LOCAL_OWNER_ID,
      revision: 0,
    }
    await db.documents.put(fresh)
    setActiveDocPointer(fresh.id)
    return [fresh]
  }

  const records = entries.map(toDocumentRecord)

  await db.transaction('rw', db.documents, db.documentSegments, async () => {
    for (const entry of entries) {
      const record = toDocumentRecord(entry)
      await db.documents.put(record)

      // Content lives under `lexical-doc-state:<id>` (Task 2 scheme) — the
      // single flat `lexical-doc-state` key only applies to the older,
      // pre-Task-2 single-document shape handled above.
      const rawState = localStorage.getItem(`lexical-doc-state:${entry.id}`) ?? localStorage.getItem(LEGACY_STATE_KEY)
      if (rawState) {
        try {
          const state = unwrapLegacyState(rawState)
          await db.documentSegments.put({
            id: segmentIdFor(entry.id),
            documentId: entry.id,
            order: 0,
            heading: null,
            state,
            updatedAt: record.updatedAt,
          })
        } catch {
          // Unparseable legacy content stays recoverable manually in
          // localStorage under its original key; InitStreamPlugin's
          // corrupted-backup path only applies to the live Dexie read path
          // going forward, not this one-time migration step.
        }
      }
    }
  })

  const savedActive = (() => {
    try {
      return localStorage.getItem(ACTIVE_DOC_KEY)
    } catch {
      return null
    }
  })()
  const activeId = savedActive && entries.some(e => e.id === savedActive) ? savedActive : entries[0].id
  setActiveDocPointer(activeId)

  return records
}

export interface BootstrapResult {
  documents: DocumentRecord[]
  activeId: string
}

export async function bootstrap(): Promise<BootstrapResult> {
  const existing = await db.documents.toArray()
  if (existing.length > 0) {
    const savedActive = (() => {
      try {
        return localStorage.getItem(ACTIVE_DOC_KEY)
      } catch {
        return null
      }
    })()
    const activeId = savedActive && existing.some(d => d.id === savedActive) ? savedActive : existing[0].id
    return { documents: existing, activeId }
  }

  const migrated = await migrateFromLocalStorage()
  const savedActive = (() => {
    try {
      return localStorage.getItem(ACTIVE_DOC_KEY)
    } catch {
      return null
    }
  })()
  const activeId = savedActive && migrated.some(d => d.id === savedActive) ? savedActive : migrated[0].id
  return { documents: migrated, activeId }
}

export function setActiveDocPointer(id: string): void {
  try {
    localStorage.setItem(ACTIVE_DOC_KEY, id)
  } catch {
    // best-effort — worst case, next load picks the first document instead
  }
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  return db.documents.toArray()
}

export function emptyDocumentRecord(): DocumentRecord {
  const ts = nowIso()
  return {
    id: genId(),
    title: 'Untitled',
    createdAt: ts,
    updatedAt: ts,
    schemaVersion: DOC_SCHEMA_VERSION,
    syncStatus: 'local',
    wordCount: 0,
    lastSaved: null,
    ownerId: LOCAL_OWNER_ID,
    revision: 0,
  }
}

export async function createDocumentRecord(): Promise<DocumentRecord> {
  const record = emptyDocumentRecord()
  await db.documents.put(record)
  return record
}

export async function updateDocumentMeta(
  id: string,
  patch: Partial<Pick<DocumentRecord, 'title' | 'lastSaved' | 'wordCount'>>,
): Promise<void> {
  await db.documents
    .where('id')
    .equals(id)
    .modify(d => {
      Object.assign(d, patch, { updatedAt: nowIso(), revision: d.revision + 1 })
    })
}

export async function deleteDocumentRecord(id: string): Promise<void> {
  await db.transaction('rw', db.documents, db.documentSegments, async () => {
    await db.documents.delete(id)
    await db.documentSegments.where('documentId').equals(id).delete()
  })
}

export async function getSegment0State(docId: string): Promise<unknown | null> {
  const seg = await db.documentSegments.get(segmentIdFor(docId))
  return seg ? seg.state : null
}

export async function saveSegment0State(docId: string, state: unknown): Promise<void> {
  await db.documentSegments.put({
    id: segmentIdFor(docId),
    documentId: docId,
    order: 0,
    heading: null,
    state,
    updatedAt: nowIso(),
  })
}

export async function deleteSegment0State(docId: string): Promise<void> {
  await db.documentSegments.delete(segmentIdFor(docId))
}
