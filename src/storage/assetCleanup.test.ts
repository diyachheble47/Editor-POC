import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createDocumentRecord, saveSegment0State } from './documentRepo'
import { saveAsset, getAsset, listAssetIds } from '../editor/assetStore'
import { findOrphanedAssetIds, deleteOrphanedAssets } from './assetCleanup'

async function clearAll() {
  await db.documents.clear()
  await db.documentSegments.clear()
  localStorage.clear()
  for (const id of await listAssetIds()) {
    const { deleteAsset } = await import('../editor/assetStore')
    await deleteAsset(id)
  }
}

function blob(label: string) {
  return new Blob([label], { type: 'model/gltf-binary' })
}

describe('assetCleanup', () => {
  beforeEach(async () => {
    await clearAll()
  })

  it('reports no orphans when every stored asset is referenced', async () => {
    const doc = await createDocumentRecord()
    await saveAsset('asset-a', blob('a'))
    await saveSegment0State(doc.id, { root: { modelUrl: 'idb-asset:asset-a' } })

    const result = await findOrphanedAssetIds()
    expect(result.totalAssetCount).toBe(1)
    expect(result.referencedIds).toEqual(['asset-a'])
    expect(result.orphanedIds).toEqual([])
  })

  it('finds assets referenced by no document as orphans', async () => {
    const doc = await createDocumentRecord()
    await saveAsset('asset-used', blob('used'))
    await saveAsset('asset-orphan-1', blob('o1'))
    await saveAsset('asset-orphan-2', blob('o2'))
    await saveSegment0State(doc.id, { root: { modelUrl: 'idb-asset:asset-used' } })

    const result = await findOrphanedAssetIds()
    expect(result.totalAssetCount).toBe(3)
    expect(result.orphanedIds.sort()).toEqual(['asset-orphan-1', 'asset-orphan-2'])
  })

  it('treats an asset referenced by any document (not just the first) as not orphaned', async () => {
    const docA = await createDocumentRecord()
    const docB = await createDocumentRecord()
    await saveAsset('asset-x', blob('x'))
    await saveSegment0State(docA.id, { root: { text: 'no model here' } })
    await saveSegment0State(docB.id, { root: { modelUrl: 'idb-asset:asset-x' } })

    const result = await findOrphanedAssetIds()
    expect(result.orphanedIds).toEqual([])
  })

  it('does not crash on documents with no segment content yet', async () => {
    await createDocumentRecord() // never saved, getSegment0State resolves null
    await saveAsset('asset-solo', blob('solo'))

    const result = await findOrphanedAssetIds()
    expect(result.orphanedIds).toEqual(['asset-solo'])
  })

  it('deleteOrphanedAssets removes only the orphaned blobs and leaves referenced ones intact', async () => {
    const doc = await createDocumentRecord()
    await saveAsset('asset-keep', blob('keep'))
    await saveAsset('asset-remove', blob('remove'))
    await saveSegment0State(doc.id, { root: { modelUrl: 'idb-asset:asset-keep' } })

    const result = await deleteOrphanedAssets()
    expect(result.deletedIds).toEqual(['asset-remove'])
    expect(result.failedIds).toEqual([])

    expect(await getAsset('asset-keep')).not.toBeNull()
    expect(await getAsset('asset-remove')).toBeNull()
  })
})
