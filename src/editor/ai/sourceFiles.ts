// Documents a teacher adds so the AI agent can write from them ("/agent workbook from a file").
//
// The file is read here, in the browser: only its text goes to the AI, never the file itself.
//   PDF  -> text per page, each page marked `[page N]` so the AI can say where something came from
//   DOCX -> plain text
//   TXT / MD -> as they are
// Files with no readable text (scans) are refused with a clear message instead of sending nothing.
// Added files are remembered until the page is reloaded, so a second /agent line can reuse them.

export const SOURCE_ACCEPT = '.pdf,.docx,.txt,.md'
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024
/** Longest text kept per file. The rest is dropped and the teacher is told. */
export const MAX_SOURCE_CHARS = 120_000
const MIN_TEXT_CHARS = 50

export interface SourceFile {
  id: string
  name: string
  /** PDF page count; null for formats that have no pages. */
  pages: number | null
  text: string
  /** True when the file was longer than MAX_SOURCE_CHARS and the end was left out. */
  truncated: boolean
}

export class SourceError extends Error {}

const EXTENSIONS = ['pdf', 'docx', 'txt', 'md']
const extensionOf = (name: string) => (name.split('.').pop() ?? '').toLowerCase()

/** A message when this file cannot be used, otherwise null. */
export function validateSourceFile(file: { name: string; size: number }): string | null {
  if (!EXTENSIONS.includes(extensionOf(file.name))) return 'Use a PDF, DOCX, TXT or MD file.'
  if (file.size > MAX_SOURCE_BYTES) return `${file.name} is over 10 MB.`
  if (file.size === 0) return `${file.name} is empty.`
  return null
}

function tidy(text: string): string {
  return text.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function pdfText(file: File): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  try {
    const parts: string[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      let pageText = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        pageText += item.str + (item.hasEOL ? '\n' : ' ')
      }
      const body = tidy(pageText)
      if (body) parts.push(`[page ${n}]\n${body}`)
      // Nothing past the cap is used, so a huge PDF is not read to the end (it could freeze the tab).
      if (parts.reduce((len, part) => len + part.length, 0) > MAX_SOURCE_CHARS) break
    }
    return { text: parts.join('\n\n'), pages: doc.numPages }
  } finally {
    void doc.destroy()
  }
}

async function docxText(file: File): Promise<string> {
  // The browser build is a UMD bundle: a production build exposes it only as the default export.
  const mod = await import('mammoth/mammoth.browser')
  const mammoth = mod.default ?? mod
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return tidy(result.value)
}

/** Reads one file into text the AI can use. Throws SourceError with a message for the teacher. */
export async function readSourceFile(file: File): Promise<SourceFile> {
  const problem = validateSourceFile(file)
  if (problem) throw new SourceError(problem)
  let text = ''
  let pages: number | null = null
  try {
    const ext = extensionOf(file.name)
    if (ext === 'pdf') ({ text, pages } = await pdfText(file))
    else if (ext === 'docx') text = await docxText(file)
    else text = tidy(await file.text())
  } catch (err) {
    console.error(`Could not read ${file.name}`, err)
    throw new SourceError(`${file.name} could not be read. It may be damaged or password-protected.`)
  }
  if (text.replace(/\s/g, '').length < MIN_TEXT_CHARS) {
    throw new SourceError(`No readable text in ${file.name}. Scanned pages are not supported yet.`)
  }
  const truncated = text.length > MAX_SOURCE_CHARS
  return {
    id: `src-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: file.name,
    pages,
    text: truncated ? text.slice(0, MAX_SOURCE_CHARS) : text,
    truncated,
  }
}

/** Opens the system file dialog. Resolves with the chosen file, or null if it was cancelled. */
export function chooseSourceFile(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = SOURCE_ACCEPT
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

// ── Files added during this visit ────────────────────────────────────────────

const known: SourceFile[] = []

export const knownSources = (): readonly SourceFile[] => known

export function rememberSource(src: SourceFile): SourceFile {
  const i = known.findIndex(s => s.name === src.name)
  if (i >= 0) known.splice(i, 1)
  known.unshift(src)
  return src
}

/** The remembered file whose name starts `text` (case does not matter), and what comes after it. */
export function matchSource(text: string): { source: SourceFile; rest: string } | null {
  const lower = text.toLowerCase()
  // Longest name first, so "notes.pdf" is never taken for "notes.pdf.docx".
  for (const source of [...known].sort((a, b) => b.name.length - a.name.length)) {
    if (lower.startsWith(source.name.toLowerCase())) {
      return { source, rest: text.slice(source.name.length).replace(/^[\s,.:;-]+/, '') }
    }
  }
  return null
}

/** How the file is described to the teacher: "12 pages" or "4,100 words". */
export function describeSource(s: SourceFile): string {
  if (s.pages) return `${s.pages} page${s.pages === 1 ? '' : 's'}`
  const words = s.text.split(/\s+/).filter(Boolean).length
  return `${words.toLocaleString('en-US')} words`
}
