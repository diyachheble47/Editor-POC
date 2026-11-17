// Document persistence. The FastAPI backend (see /backend) is the only store:
// there is no local database and no background sync. Nothing is written until
// the user saves (Save button / Ctrl+S), and nothing is readable when the
// server is unreachable — callers surface that as an error.
import {
  ApiError,
  createServerDocument,
  deleteServerDocument,
  getServerSegment,
  listServerDocuments,
  saveServerSegment,
} from './api'
import type { ServerDocument } from './api'
import { deleteAsset } from '../editor/assetStore'

export interface DocumentRecord {
  id: string
  title: string
  createdAt: string // ISO
  updatedAt: string // ISO
  wordCount: number
  lastSaved: string | null // ISO — last time the server stored content
  // Server's save counter; sent back on save so a stale tab can't silently
  // overwrite a newer copy.
  revision: number
}

const ACTIVE_DOC_KEY = 'tnb-active-doc-id' // small pointer only, not content

function genId(): string {
  return `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function toRecord(doc: ServerDocument): DocumentRecord {
  return {
    id: doc.id,
    title: doc.title,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    wordCount: doc.wordCount,
    lastSaved: doc.revision > 0 ? doc.updatedAt : null,
    revision: doc.revision,
  }
}

export function getActiveDocPointer(): string | null {
  try {
    return localStorage.getItem(ACTIVE_DOC_KEY)
  } catch {
    return null
  }
}

export function setActiveDocPointer(id: string): void {
  try {
    localStorage.setItem(ACTIVE_DOC_KEY, id)
  } catch {
    // best-effort — worst case, next load opens the first document
  }
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  return (await listServerDocuments()).map(d => toRecord(d))
}

export async function createDocument(title = 'Untitled'): Promise<DocumentRecord> {
  return toRecord(await createServerDocument(genId(), title))
}

export interface BootstrapResult {
  documents: DocumentRecord[]
  activeId: string
}

/** Loads the document list; a completely empty server gets one blank document. */
export async function bootstrap(): Promise<BootstrapResult> {
  let documents = await listDocuments()
  if (documents.length === 0) {
    documents = [await createDocument()]
  }
  const pointer = getActiveDocPointer()
  const activeId = pointer && documents.some(d => d.id === pointer) ? pointer : documents[0].id
  return { documents, activeId }
}

export async function loadDocumentState(docId: string): Promise<unknown | null> {
  try {
    return (await getServerSegment(docId)).state
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null // never saved yet
    throw err
  }
}

export async function saveDocument(
  docId: string,
  input: { state: unknown; title: string; wordCount: number; baseRevision: number },
): Promise<DocumentRecord> {
  // The server also frees model files this save no longer references.
  return toRecord(await saveServerSegment(docId, input))
}

const ASSET_REF = /idb-asset:([a-zA-Z0-9-]+)/g
const assetIdsIn = (state: unknown): Set<string> =>
  new Set([...JSON.stringify(state ?? null).matchAll(ASSET_REF)].map(m => m[1]))

/**
 * DELETE /documents/{id}. The 3D models the document used live in this
 * browser's IndexedDB, so the ones no other document references are removed
 * from there too (the server only ever held their references).
 */
export async function deleteDocument(docId: string): Promise<void> {
  let modelIds = new Set<string>()
  try { modelIds = assetIdsIn(await loadDocumentState(docId)) } catch { /* nothing to clean */ }
  try {
    await deleteServerDocument(docId)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return
    throw err
  }
  if (modelIds.size === 0) return
  try {
    for (const doc of await listDocuments()) {
      for (const id of assetIdsIn(await loadDocumentState(doc.id))) modelIds.delete(id) // still used elsewhere
    }
    await Promise.all([...modelIds].map(id => deleteAsset(id)))
  } catch { /* cleanup is best effort; the orphan sweep can finish it */ }
}
