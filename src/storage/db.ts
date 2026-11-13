import Dexie, { type Table } from 'dexie'

// ── Record shapes ────────────────────────────────────────────────────────────
//
// These mirror the spec's required stores (documents, documentSegments,
// assets, assetMetadata, pendingSync, syncState). This file only stands up
// the schema — nothing reads or writes through it yet. Existing storage
// (localStorage via DocumentContext, the raw-IndexedDB `assetStore.ts`)
// keeps working unchanged until the migration task wires this in.

export type SyncStatus = 'local' | 'pending' | 'synced' | 'error'

export interface DocumentRecord {
  id: string
  title: string
  createdAt: string // ISO
  updatedAt: string // ISO
  schemaVersion: number
  syncStatus: SyncStatus
  wordCount: number
  lastSaved: string | null // ISO
  seedDemo?: boolean
  // Single-user stub per the B0 decision: no real auth yet, every document
  // is owned by this fixed placeholder so the backend's ownership-check
  // shape is in place without building login UI. Swapping in real accounts
  // later changes how this value is obtained, not the schema around it.
  ownerId: string
  // Optimistic-concurrency counter — incremented on every local save,
  // compared against the server's copy once a backend exists (Phase B/D).
  revision: number
}

export interface DocumentSegmentRecord {
  id: string
  documentId: string
  order: number
  heading: string | null
  // Same `{ version, state }` envelope as serializeDocState/deserializeDocState
  // in DocumentContext.tsx, kept consistent once segments replace the
  // single-blob-per-document model (Phase C).
  state: unknown
  updatedAt: string // ISO
}

export interface AssetRecord {
  id: string // assetId, same id space as the existing assetStore.ts keys
  blob: Blob
  createdAt: string // ISO
}

export interface AssetMetadataRecord {
  assetId: string
  filename: string
  mimeType: string
  size: number
  uploadStatus: SyncStatus
  // Document IDs currently referencing this asset. Checked before deletion
  // (spec: "checking whether assets are referenced") instead of deleting on
  // a single node's removal, which could orphan an asset still used
  // elsewhere (e.g. duplicated block).
  referencedBy: string[]
  createdAt: string // ISO
  updatedAt: string // ISO
}

export type SyncEntityType = 'document' | 'segment' | 'asset'
export type SyncOperation = 'create' | 'update' | 'delete'

export interface PendingSyncRecord {
  id?: number // auto-increment
  entityType: SyncEntityType
  entityId: string
  operation: SyncOperation
  payload: unknown
  createdAt: string // ISO
  attempts: number
  lastError: string | null
}

export interface SyncStateRecord {
  key: string // `${entityType}:${entityId}`
  entityType: SyncEntityType
  entityId: string
  status: SyncStatus
  serverRevision: number | null
  lastSyncedAt: string | null
  lastError: string | null
}

// ── Database ──────────────────────────────────────────────────────────────────

export class TeacherNotebookDB extends Dexie {
  documents!: Table<DocumentRecord, string>
  documentSegments!: Table<DocumentSegmentRecord, string>
  assets!: Table<AssetRecord, string>
  assetMetadata!: Table<AssetMetadataRecord, string>
  pendingSync!: Table<PendingSyncRecord, number>
  syncState!: Table<SyncStateRecord, string>

  constructor(name = 'teacher-notebook-db') {
    super(name)
    this.version(1).stores({
      documents: 'id, updatedAt, syncStatus',
      documentSegments: 'id, documentId, [documentId+order]',
      assets: 'id',
      assetMetadata: 'assetId, uploadStatus',
      pendingSync: '++id, entityType, entityId, createdAt',
      syncState: 'key, entityType, entityId, status',
    })
  }
}

export const db = new TeacherNotebookDB()
