// Binary asset storage for large files (currently: uploaded 3D models) that
// shouldn't live inside the Lexical document JSON itself. Previously the
// whole .glb was stored as a base64 data: URI directly in the node's
// serialized state, which got re-written to localStorage on every autosave
// tick regardless of which block actually changed, and could blow the
// ~5-10MB localStorage-per-origin quota outright on a single
// reasonably-sized model (with the failure silently swallowed).
//
// IndexedDB has a much larger, browser-managed quota and stores Blobs
// natively (no base64 inflation, no synchronous main-thread writes). Nodes
// keep only a small asset-id string in their serialized state
// (see ASSET_URL_PREFIX below) and resolve it to a Blob here at render time.

const DB_NAME = 'teacher-notebook-assets'
const DB_VERSION = 1
const STORE_NAME = 'models'

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

export async function saveAsset(id: string, blob: Blob): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getAsset(id: string): Promise<Blob | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(id)
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function listAssetIds(): Promise<string[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).getAllKeys()
    req.onsuccess = () => resolve(req.result as string[])
    req.onerror = () => reject(req.error)
  })
}

// ── Node-facing helpers ──────────────────────────────────────────────────────
//
// A node's `modelUrl` field stays a plain string for backward compatibility
// with documents saved before this change (those hold a real `data:` URI
// and keep working untouched, forever — no forced migration). Only new
// uploads get the `idb-asset:` form.

export const ASSET_URL_PREFIX = 'idb-asset:'

export function assetUrlFor(id: string): string {
  return ASSET_URL_PREFIX + id
}

export function isAssetUrl(url: string): boolean {
  return url.startsWith(ASSET_URL_PREFIX)
}

export function assetIdFromUrl(url: string): string {
  return url.slice(ASSET_URL_PREFIX.length)
}
