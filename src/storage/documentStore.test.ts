import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    listServerDocuments: vi.fn(),
    createServerDocument: vi.fn(),
    deleteServerDocument: vi.fn(),
    getServerSegment: vi.fn(),
    saveServerSegment: vi.fn(),
  }
})

import * as api from './api'
import { bootstrap, deleteDocument, loadDocumentState, saveDocument } from './documentStore'

const m = vi.mocked(api)
const serverDoc = (id: string, revision: number): api.ServerDocument => ({
  id, title: 'T', createdAt: 'c', updatedAt: 'u', schemaVersion: 1, wordCount: 3, revision, ownerId: 'local-user',
})

describe('documentStore', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
  })

  it('opens the pointed-to document, else the first', async () => {
    m.listServerDocuments.mockResolvedValue([serverDoc('a', 1), serverDoc('b', 2)])
    expect((await bootstrap()).activeId).toBe('a')
    localStorage.setItem('tnb-active-doc-id', 'b')
    expect((await bootstrap()).activeId).toBe('b')
  })

  it('starts an empty server with one blank document (nothing saved yet)', async () => {
    m.listServerDocuments.mockResolvedValue([])
    m.createServerDocument.mockImplementation(async (id, title) => ({ ...serverDoc(id, 0), title }))
    const { documents } = await bootstrap()
    expect(documents).toHaveLength(1)
    expect(documents[0].title).toBe('Untitled')
    expect(m.saveServerSegment).not.toHaveBeenCalled()
  })

  it('fails loudly when the server is unreachable (no local fallback)', async () => {
    m.listServerDocuments.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(bootstrap()).rejects.toThrow()
  })

  it('treats a never-saved document as empty, but surfaces other errors', async () => {
    m.getServerSegment.mockRejectedValueOnce(new api.ApiError(404, null))
    expect(await loadDocumentState('x')).toBeNull()
    m.getServerSegment.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(loadDocumentState('x')).rejects.toThrow()
  })

  it('saves with the revision it was given and returns the new one', async () => {
    m.saveServerSegment.mockResolvedValue(serverDoc('a', 5))
    const saved = await saveDocument('a', { state: { s: 1 }, title: 'T', wordCount: 3, baseRevision: 4 })
    expect(m.saveServerSegment).toHaveBeenCalledWith('a', expect.objectContaining({ baseRevision: 4 }))
    expect(saved.revision).toBe(5)
  })

  it('passes a revision conflict through', async () => {
    m.saveServerSegment.mockRejectedValue(new api.ApiError(409, { serverRevision: 9 }))
    await expect(saveDocument('a', { state: {}, title: 'T', wordCount: 0, baseRevision: 1 })).rejects.toMatchObject({ status: 409 })
  })

  it('deleting an already-missing document is fine', async () => {
    m.deleteServerDocument.mockRejectedValue(new api.ApiError(404, null))
    await expect(deleteDocument('gone')).resolves.toBeUndefined()
  })
})
