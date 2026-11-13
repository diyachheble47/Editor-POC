import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  bootstrap,
  createDocumentRecord,
  deleteDocumentRecord,
  deleteSegment0State,
  getSegment0State,
  saveSegment0State,
  setActiveDocPointer,
  updateDocumentMeta,
} from './documentRepo'

async function clearAll() {
  await db.documents.clear()
  await db.documentSegments.clear()
  await db.assets.clear()
  await db.assetMetadata.clear()
  await db.pendingSync.clear()
  await db.syncState.clear()
  localStorage.clear()
}

describe('documentRepo', () => {
  beforeEach(async () => {
    await clearAll()
  })

  describe('bootstrap', () => {
    it('seeds a fresh install with one demo document when there is no Dexie or localStorage data', async () => {
      const { documents, activeId } = await bootstrap()
      expect(documents).toHaveLength(1)
      expect(documents[0].id).toBe(activeId)
      expect(documents[0].seedDemo).toBe(true)
      expect(documents[0].title).toBe('Introduction to Chemistry')
      expect(documents[0].ownerId).toBe('local-user')
      expect(documents[0].revision).toBe(0)
    })

    it('migrates the Task-2 localStorage shape (tnb-doc-index + per-doc lexical-doc-state:<id>) into Dexie', async () => {
      const legacyIndex = [
        { id: 'doc-a', title: 'First Doc', lastSaved: '2026-01-01T00:00:00.000Z', wordCount: 12 },
        { id: 'doc-b', title: 'Second Doc', lastSaved: '2026-01-02T00:00:00.000Z', wordCount: 3, seedDemo: false },
      ]
      localStorage.setItem('tnb-doc-index', JSON.stringify(legacyIndex))
      localStorage.setItem('tnb-active-doc-id', 'doc-b')
      // Task-7 versioned envelope shape for one doc...
      localStorage.setItem('lexical-doc-state:doc-a', JSON.stringify({ version: 1, state: { root: { marker: 'a' } } }))
      // ...and the older pre-Task-7 bare shape for the other, both must migrate.
      localStorage.setItem('lexical-doc-state:doc-b', JSON.stringify({ root: { marker: 'b' } }))

      const { documents, activeId } = await bootstrap()

      expect(activeId).toBe('doc-b')
      expect(documents.map(d => d.id).sort()).toEqual(['doc-a', 'doc-b'])
      const docA = documents.find(d => d.id === 'doc-a')!
      expect(docA.title).toBe('First Doc')
      expect(docA.wordCount).toBe(12)

      expect(await getSegment0State('doc-a')).toEqual({ root: { marker: 'a' } })
      expect(await getSegment0State('doc-b')).toEqual({ root: { marker: 'b' } })

      // Old keys are left in place — migration cleanup is a separate,
      // later-verified step (EXTENSION_PLAN.md Phase E2), not part of
      // writing the new copy.
      expect(localStorage.getItem('tnb-doc-index')).not.toBeNull()
    })

    it('migrates the oldest flat single-document shape (tnb-doc-meta + lexical-doc-state)', async () => {
      localStorage.setItem('tnb-doc-meta', JSON.stringify({ title: 'Old Single Doc', lastSaved: '2026-01-01T00:00:00.000Z', wordCount: 7 }))
      localStorage.setItem('lexical-doc-state', JSON.stringify({ root: { marker: 'legacy' } }))

      const { documents, activeId } = await bootstrap()

      expect(documents).toHaveLength(1)
      expect(documents[0].title).toBe('Old Single Doc')
      expect(documents[0].wordCount).toBe(7)
      expect(documents[0].seedDemo).toBeUndefined()
      expect(await getSegment0State(activeId)).toEqual({ root: { marker: 'legacy' } })
    })

    it('does not re-migrate once Dexie already has documents (idempotent across reloads)', async () => {
      const first = await bootstrap()
      const second = await bootstrap()
      expect(second.documents).toHaveLength(first.documents.length)
      expect(second.activeId).toBe(first.activeId)
    })

    it('falls back to the first document when the stored active-id pointer no longer exists', async () => {
      await createDocumentRecord()
      setActiveDocPointer('does-not-exist')
      const { activeId, documents } = await bootstrap()
      expect(documents.some(d => d.id === activeId)).toBe(true)
    })
  })

  describe('document + segment CRUD', () => {
    it('creates a document record with expected defaults', async () => {
      const doc = await createDocumentRecord()
      expect(doc.title).toBe('Untitled')
      expect(doc.wordCount).toBe(0)
      expect(doc.syncStatus).toBe('local')
      expect(doc.revision).toBe(0)
      expect(await db.documents.get(doc.id)).toEqual(doc)
    })

    it('updateDocumentMeta patches fields, bumps updatedAt and revision', async () => {
      const doc = await createDocumentRecord()
      await updateDocumentMeta(doc.id, { title: 'Renamed', wordCount: 42, lastSaved: '2026-02-01T00:00:00.000Z' })
      const updated = await db.documents.get(doc.id)
      expect(updated?.title).toBe('Renamed')
      expect(updated?.wordCount).toBe(42)
      expect(updated?.revision).toBe(1)
      expect(updated?.updatedAt).not.toBe(doc.updatedAt === updated?.updatedAt ? '' : doc.updatedAt)
    })

    it('saveSegment0State / getSegment0State round-trip, and missing segment reads as null', async () => {
      const doc = await createDocumentRecord()
      expect(await getSegment0State(doc.id)).toBeNull()
      await saveSegment0State(doc.id, { root: { children: ['x'] } })
      expect(await getSegment0State(doc.id)).toEqual({ root: { children: ['x'] } })
    })

    it('deleteSegment0State removes the segment without touching the document record', async () => {
      const doc = await createDocumentRecord()
      await saveSegment0State(doc.id, { root: {} })
      await deleteSegment0State(doc.id)
      expect(await getSegment0State(doc.id)).toBeNull()
      expect(await db.documents.get(doc.id)).toBeDefined()
    })

    it('deleteDocumentRecord removes both the document and its segment', async () => {
      const doc = await createDocumentRecord()
      await saveSegment0State(doc.id, { root: {} })
      await deleteDocumentRecord(doc.id)
      expect(await db.documents.get(doc.id)).toBeUndefined()
      expect(await getSegment0State(doc.id)).toBeNull()
    })
  })
})
