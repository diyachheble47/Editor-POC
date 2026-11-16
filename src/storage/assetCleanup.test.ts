import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory stand-in for the backend: documents' saved states.
const states = new Map<string, unknown>()

vi.mock('./documentStore', () => ({
  listDocuments: async () => [...states.keys()].map(id => ({ id })),
  loadDocumentState: async (id: string) => states.get(id) ?? null,
}))
vi.mock('./api', () => ({
  listServerAssetIds: async () => [],
  uploadServerAsset: async () => {},
  downloadServerAsset: async () => { throw new Error('404') },
  deleteServerAsset: async () => {},
}))

import { saveAsset, getAsset, listAssetIds, deleteAsset } from '../editor/assetStore'
import { findOrphanedAssetIds, deleteOrphanedAssets } from './assetCleanup'

const blob = (label: string) => new Blob([label], { type: 'model/gltf-binary' })
const ref = (id: string) => ({ root: { modelUrl: `idb-asset:${id}` } })

describe('assetCleanup', () => {
  beforeEach(async () => {
    states.clear()
    for (const id of await listAssetIds()) await deleteAsset(id)
  })

  it('reports no orphans when every stored asset is referenced', async () => {
    states.set('d1', ref('asset-a'))
    await saveAsset('asset-a', blob('a'))

    const result = await findOrphanedAssetIds()
    expect(result.totalAssetCount).toBe(1)
    expect(result.referencedIds).toEqual(['asset-a'])
    expect(result.orphanedIds).toEqual([])
  })

  it('finds assets referenced by no document as orphans', async () => {
    states.set('d1', ref('asset-used'))
    await saveAsset('asset-used', blob('used'))
    await saveAsset('asset-orphan-1', blob('o1'))
    await saveAsset('asset-orphan-2', blob('o2'))

    const result = await findOrphanedAssetIds()
    expect(result.orphanedIds.sort()).toEqual(['asset-orphan-1', 'asset-orphan-2'])
  })

  it('treats an asset referenced by any document as not orphaned', async () => {
    states.set('a', { root: { text: 'no model here' } })
    states.set('b', ref('asset-x'))
    await saveAsset('asset-x', blob('x'))

    expect((await findOrphanedAssetIds()).orphanedIds).toEqual([])
  })

  it('deleteOrphanedAssets removes only the orphaned files', async () => {
    states.set('d1', ref('asset-keep'))
    await saveAsset('asset-keep', blob('keep'))
    await saveAsset('asset-remove', blob('remove'))

    const result = await deleteOrphanedAssets()
    expect(result.deletedIds).toEqual(['asset-remove'])
    expect(await getAsset('asset-keep')).not.toBeNull()
    expect(await getAsset('asset-remove')).toBeNull()
  })
})
