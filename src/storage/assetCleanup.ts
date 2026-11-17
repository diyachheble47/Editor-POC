// Finds and removes 3D-model files in this browser's IndexedDB that no saved document
// references — e.g. a block that was deleted, or an upload whose document was
// never saved.
//
// Deliberately NOT run automatically: a model uploaded into a document that
// hasn't been saved yet looks unreferenced and would be swept right after the
// upload. This is an explicit, user-triggered action only.
import { listAssetIds, deleteAsset } from '../editor/assetStore'
import { listDocuments, loadDocumentState } from './documentStore'

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
    const state = await loadDocumentState(doc.id)
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
