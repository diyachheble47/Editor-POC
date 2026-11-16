// Thin client for the FastAPI backend in /backend. Network failures throw as
// usual (TypeError / AbortError) and HTTP errors throw ApiError, so callers
// can tell "server unreachable" (stay offline, retry later) from "server said
// no" (e.g. a 409 revision conflict).

const BASE: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'
const TIMEOUT_MS = 5000

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, detail: unknown) {
    super(`API ${status}`)
    this.status = status
    this.detail = detail
  }
}

export interface ServerDocument {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  schemaVersion: number
  wordCount: number
  revision: number
  ownerId: string
}

export interface ServerSegment {
  documentId: string
  position: number
  heading: string | null
  state: unknown
  updatedAt: string
  revision: number
}

async function request(path: string, init: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, signal: controller.signal })
    if (!res.ok) {
      const detail = await res.json().catch(() => null)
      throw new ApiError(res.status, (detail as { detail?: unknown } | null)?.detail ?? detail)
    }
    return res
  } finally {
    clearTimeout(timer)
  }
}

const json = (body: unknown): RequestInit => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export async function listServerDocuments(): Promise<ServerDocument[]> {
  return (await request('/documents')).json()
}

export async function getServerDocument(id: string): Promise<ServerDocument> {
  return (await request(`/documents/${encodeURIComponent(id)}`)).json()
}

export async function createServerDocument(id: string, title: string): Promise<ServerDocument> {
  return (await request('/documents', { method: 'POST', ...json({ id, title }) })).json()
}

export async function deleteServerDocument(id: string): Promise<void> {
  await request(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function getServerSegment(id: string, position = 0): Promise<ServerSegment> {
  return (await request(`/documents/${encodeURIComponent(id)}/segments/${position}`)).json()
}

export async function saveServerSegment(
  id: string,
  body: { state: unknown; title: string; wordCount: number; baseRevision: number },
  position = 0,
): Promise<ServerDocument> {
  return (
    await request(`/documents/${encodeURIComponent(id)}/segments/${position}`, { method: 'PUT', ...json(body) })
  ).json()
}

export async function listServerAssetIds(): Promise<string[]> {
  const rows = (await (await request('/assets')).json()) as { assetId: string }[]
  return rows.map(r => r.assetId)
}

export async function uploadServerAsset(id: string, blob: Blob): Promise<void> {
  const form = new FormData()
  form.append('file', blob, (blob as File).name || id)
  // Model files are large; give the upload longer than the default.
  await request(`/assets/${encodeURIComponent(id)}`, { method: 'PUT', body: form }, 120_000)
}

export async function downloadServerAsset(id: string): Promise<Blob> {
  return (await request(`/assets/${encodeURIComponent(id)}`, {}, 120_000)).blob()
}

export async function deleteServerAsset(id: string): Promise<void> {
  await request(`/assets/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// One event of GET /documents/{id}/stream (Server-Sent Events). The SSE
// `event:` name is the type; `data:` is this same object as JSON.
export type StreamEvent =
  | { t: 'start'; blocks: number; revision: number }
  | { t: 'open'; node: Record<string, unknown> } // an empty text block
  | { t: 'text'; child: Record<string, unknown> } // a piece of text for the open block
  | { t: 'close' }
  | { t: 'block'; node: Record<string, unknown> } // a whole block
  | { t: 'done' }

/**
 * Streams a saved document, calling onEvent as each event arrives. Resolves
 * false if the document was never saved (404), true once `done` arrives.
 * Network errors and aborts throw.
 */
export async function streamServerDocument(
  id: string,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await fetch(`${BASE}/documents/${encodeURIComponent(id)}/stream`, {
    headers: { accept: 'text/event-stream' },
    signal,
  })
  if (res.status === 404) return false
  if (!res.ok || !res.body) throw new ApiError(res.status, null)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (value) buffer += decoder.decode(value, { stream: !done })
    let end: number
    while ((end = buffer.indexOf('\n\n')) !== -1) { // events end with a blank line
      const frame = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const data = frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n')
      if (!data) continue
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const event = JSON.parse(data) as StreamEvent
      onEvent(event)
      if (event.t === 'done') return true
    }
    if (done) throw new Error('Stream ended before done')
  }
}
