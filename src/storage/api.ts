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

async function request(
  path: string,
  init: RequestInit = {},
  timeoutMs = TIMEOUT_MS,
  okStatuses: number[] = [],
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, signal: controller.signal })
    if (!res.ok && !okStatuses.includes(res.status)) {
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
 * Reads a Server-Sent Events body, calling onData with each event's JSON
 * `data`. Parsed by hand over fetch (not EventSource) so it can be aborted
 * and the browser doesn't auto-reconnect and replay a finished stream.
 * Return true from onData to stop reading (the stream's last event).
 */
async function readSse(res: Response, onData: (data: unknown) => boolean | void, signal?: AbortSignal): Promise<void> {
  if (!res.body) throw new ApiError(res.status, null)
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
      if (onData(JSON.parse(data))) { void reader.cancel(); return }
    }
    if (done) throw new Error('Stream ended before done')
  }
}

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
  if (!res.ok) throw new ApiError(res.status, null)
  await readSse(res, data => {
    const event = data as StreamEvent
    onEvent(event)
    return event.t === 'done'
  }, signal)
  return true
}

// ── AI generation ────────────────────────────────────────────────────────────

export type AiKind = 'workbook' | 'lesson_plan' | 'lesson'

export interface AiRequest {
  title: string
  description: string
  /** Text of the existing document, when generating from it. */
  context?: string
  kind: AiKind
}

/** A block the AI produced (already checked and cleaned by the server). */
export type AiBlock =
  | { type: 'heading'; level: 1 | 2 | 3 }
  | { type: 'paragraph' }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'equation'; value: string } // chemical equation
  | { type: 'math'; latex: string } // maths / physics formula (LaTeX)
  | { type: 'callout'; variant: 'info' | 'tip' | 'warning' | 'caution'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'divider' }
  | { type: 'code'; language: string; text: string }
  | { type: 'table'; rows: string[][] } // editable spreadsheet grid
  | { type: 'matrix'; rows: string[][] } // maths matrix
  | { type: 'graph'; functions: string[]; points: [number, number][]; connect: boolean }
  | { type: 'geometry'; polygons: [number, number][][]; segments: [number, number][][] }
  | { type: 'molecule'; name?: string; smiles?: string }
  | { type: 'flowchart'; nodes: { id: string; kind: 'start' | 'end' | 'process' | 'decision' | 'io'; text: string }[]; edges: [string, string, string?][] }
  | { type: 'chart'; chartType: 'bar' | 'line' | 'pie'; title: string; labels: string[]; series: { name: string; values: number[] }[] }
  | { type: 'circuit'; parts: { id: string; type: string; value?: string; closed?: boolean }[]; wires: [string, string][] }

export type AiEvent =
  | { t: 'start' }
  | { t: 'open'; block: AiBlock } // heading/paragraph: text follows in pieces
  | { t: 'text'; text: string }
  | { t: 'close' }
  | { t: 'block'; block: AiBlock } // anything else, whole
  | { t: 'done'; blocks: number }
  | { t: 'error'; message: string }

export async function getAiStatus(): Promise<boolean> {
  try {
    return ((await (await request('/ai/status')).json()) as { configured: boolean }).configured
  } catch {
    return false
  }
}

/** Calls the backend generator and streams its events. Throws ApiError on 503 etc. */
export async function streamAiDocument(
  body: AiRequest,
  onEvent: (event: AiEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/ai/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new ApiError(res.status, (detail as { detail?: unknown } | null)?.detail ?? detail)
  }
  await readSse(res, data => {
    const event = data as AiEvent
    onEvent(event)
    return event.t === 'done' || event.t === 'error'
  }, signal)
}
