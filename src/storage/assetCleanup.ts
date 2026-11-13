// Finds and removes 3D-model asset blobs (in the raw IndexedDB store owned
// by assetStore.ts) that no document currently references — e.g. a model
// that was replaced on its node (the stable-key overwrite in
// Model3DViewer.loadFile covers that case) or whose block got deleted
// entirely, which was never cleaned up (flagged as a known follow-up when
// the asset store was introduced — TASKS.md Task 4).
//
// Deliberately NOT wired into automatic startup cleanup: an asset upload
// that hasn't been autosaved yet (AutoSavePlugin debounces 1.5s) would look
// unreferenced for that window and could be swept as an orphan right after
// the user uploaded it — worse than the problem this fixes. This is exposed
// as an explicit, user-triggered action only.
import { listAssetIds, deleteAsset } from '../editor/assetStore'
import { listDocuments, getSegment0State } from './documentRepo'

const ASSET_REF_PATTERN = /idb-asset:([a-zA-Z0-9-]+)/g

export interface OrphanScanResult {
  orphanedIds: string[]
  referencedIds: string[]
  totalAssetCount: number
}

export async function findOrphanedAssetIds(): Promise<OrphanScanResult> {
  const documents = await listDocuments()
  const referenced = new Set<string>()

  for (const doc of documents) {
    const state = await getSegment0State(doc.id)
    if (state === null) continue
    const json = JSON.stringify(state)
    for (const match of json.matchAll(ASSET_REF_PATTERN)) {
      referenced.add(match[1])
    }
  }

  const allIds = await listAssetIds()
  const orphanedIds = allIds.filter(id => !referenced.has(id))

  return { orphanedIds, referencedIds: Array.from(referenced), totalAssetCount: allIds.length }
}

export interface OrphanCleanupResult {
  deletedIds: string[]
  failedIds: string[]
}

export async function deleteOrphanedAssets(): Promise<OrphanCleanupResult> {
  const { orphanedIds } = await findOrphanedAssetIds()
  const deletedIds: string[] = []
  const failedIds: string[] = []

  for (const id of orphanedIds) {
    try {
      await deleteAsset(id)
      deletedIds.push(id)
    } catch {
      failedIds.push(id)
    }
  }

  return { deletedIds, failedIds }
}
