// Binary storage for uploaded 3D models, kept out of the document on purpose.
//
// The document (saved on the backend) holds only a short reference to a model
// (see ASSET_URL_PREFIX below). The model file itself lives in THIS browser's
// IndexedDB, not on the server and not in memory: a blob is read from
// IndexedDB only when its block scrolls into view (Model3DViewer) and the
// scene is torn down again when it leaves, so RAM, GPU and CPU stay flat no
// matter how many models a document has.

const DB_NAME = 'teacher-notebook-assets'
const DB_VERSION = 3
const STORE_NAME = 'models'

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (db.objectStoreNames.contains('cache')) db.deleteObjectStore('cache') // short-lived experiment
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const req = op(tx.objectStore(STORE_NAME))
    tx.oncomplete = () => resolve(req.result)
    tx.onerror = () => reject(tx.error)
  }))
}

export async function saveAsset(id: string, blob: Blob): Promise<void> {
  await run('readwrite', s => s.put(blob, id))
}

/** The stored file, or null if this browser doesn't have it. */
export async function getAsset(id: string): Promise<Blob | null> {
  return ((await run('readonly', s => s.get(id))) as Blob | undefined) ?? null
}

export async function deleteAsset(id: string): Promise<void> {
  await run('readwrite', s => s.delete(id))
}

export async function listAssetIds(): Promise<string[]> {
  return (await run('readonly', s => s.getAllKeys())) as string[]
}

// ── Node-facing helpers ──────────────────────────────────────────────────────
//
// A node's `modelUrl` field stays a plain string for backward compatibility
// with documents saved before this change (those hold a real `data:` URI
// and keep working untouched, forever — no forced migration). Only new
// uploads get the `idb-asset:` form (the name is historical; renaming it
// would break every saved document).

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
