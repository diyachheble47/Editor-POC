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
import { MOCK_DOCUMENT_PARAGRAPHS, MOCK_DOCUMENT_TITLE } from '../editor/mockDocument'

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

// The sample lesson a brand-new server starts with. It is stored as a normal
// saved document, so from then on it is read back (and streamed) like any other.
function sampleLessonState() {
  return {
    root: {
      type: 'root', version: 1, direction: 'ltr', format: '', indent: 0,
      children: MOCK_DOCUMENT_PARAGRAPHS.map(text => ({
        type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, textFormat: 0, textStyle: '',
        children: [{ type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' }],
      })),
    },
  }
}

export interface BootstrapResult {
  documents: DocumentRecord[]
  activeId: string
}

/** Loads the document list; a completely empty server gets one demo document. */
export async function bootstrap(): Promise<BootstrapResult> {
  let documents = await listDocuments()
  if (documents.length === 0) {
    const created = await createDocument(MOCK_DOCUMENT_TITLE)
    documents = [await saveDocument(created.id, {
      state: sampleLessonState(), title: created.title, wordCount: 0, baseRevision: created.revision,
    })]
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
  return toRecord(await saveServerSegment(docId, input))
}

export async function deleteDocument(docId: string): Promise<void> {
  try {
    await deleteServerDocument(docId)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return
    throw err
  }
}
