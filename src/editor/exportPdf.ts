// Export as PDF: the document's rendered DOM is sent to the backend, which lays it
// out with WeasyPrint (see backend/app/routers/export.py) and returns the PDF.

import type { LexicalEditor } from 'lexical'
import { collectStyles, prepareBody } from './exportHtml'
import type { JsonNode } from './exportHtml'
import { renderMermaid } from './nodes/mermaid/mermaidRender'
import { printMediaForPdf } from './nodes/media/mediaExport'

const API: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

/** blob: image URLs only exist in this browser, so the server could not load them. */
async function inlineImages(body: HTMLElement): Promise<void> {
  const imgs = Array.from(body.querySelectorAll<HTMLImageElement>('img[src^="blob:"]'))
  await Promise.all(imgs.map(async img => {
    try {
      const blob = await (await fetch(img.src)).blob()
      img.src = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = () => reject(r.error)
        r.readAsDataURL(blob)
      })
    } catch { img.remove() }
  }))
}

/** A canvas (graph, molecule, 3D) becomes a picture; a blank one becomes a labelled note. */
function flattenCanvases(live: HTMLElement, copy: HTMLElement): void {
  const from = Array.from(live.querySelectorAll('canvas'))
  const to = Array.from(copy.querySelectorAll('canvas'))
  to.forEach((c, i) => {
    let url = ''
    try { url = from[i]?.toDataURL('image/png') ?? '' } catch { /* tainted canvas */ }
    // A 3D view cleared after rendering gives a tiny transparent PNG: treat as blank.
    if (url.length > 2000) {
      const img = document.createElement('img')
      img.src = url
      img.style.cssText = 'max-width:100%;height:auto'
      c.replaceWith(img)
    } else {
      const note = document.createElement('div')
      note.className = 'pdf-placeholder'
      note.textContent = 'Interactive figure: open the document to explore it.'
      c.replaceWith(note)
    }
  })
}


/** Copies every computed style onto the clone, so it looks the same away from the app's CSS. */
function inlineStyles(live: Element, copy: Element): void {
  const cs = getComputedStyle(live)
  const style = (copy as HTMLElement | SVGElement).style
  if (style) for (const prop of Array.from(cs)) style.setProperty(prop, cs.getPropertyValue(prop))
  const a = live.children, b = copy.children
  for (let i = 0; i < a.length && i < b.length; i++) inlineStyles(a[i], b[i])
}

/** Draws a piece of the page into a PNG (the browser renders it; the server never has to). */
async function rasterize(el: HTMLElement): Promise<string> {
  const { width, height } = el.getBoundingClientRect()
  const w = Math.ceil(width), h = Math.ceil(height)
  if (w < 4 || h < 4) throw new Error('empty')
  const clone = el.cloneNode(true) as HTMLElement
  inlineStyles(el, clone)
  clone.style.margin = '0'
  clone.querySelectorAll('.react-flow__attribution, .react-flow__controls, .react-flow__minimap').forEach(n => n.remove())
  return rasterizeXhtml(new XMLSerializer().serializeToString(clone), w, h, '#fff')
}

/** Draws serialized XHTML of the given size into a PNG on the given background colour. */
async function rasterizeXhtml(xml: string, w: number, h: number, bg: string): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await img.decode()
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = w * scale
  canvas.height = h * scale
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

function pictureOf(url: string, cls: string): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = cls
  const img = document.createElement('img')
  img.src = url
  img.style.cssText = 'max-width:100%;height:auto'
  wrap.append(img)
  return wrap
}

function note(text: string): HTMLElement {
  const n = document.createElement('div')
  n.className = 'pdf-placeholder'
  n.textContent = text
  return n
}

/** A preview picture for embeds that have a well-known one (the server may fetch only these hosts). */
function thumbnailFor(src: string): string {
  try {
    const u = new URL(src)
    if (/(^|\.)youtube(-nocookie)?\.com$/.test(u.hostname)) {
      const id = u.pathname.split('/').filter(Boolean).pop()
      if (id && /^[\w-]{6,20}$/.test(id)) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`
    }
    if (u.hostname === 'phet.colorado.edu') {
      const m = u.pathname.match(/^(.*\/([\w-]+))_all\.html$/) // .../sims/html/<name>/latest/<name>_all.html
      if (m) return `https://phet.colorado.edu${m[1]}-600.png`
    }
  } catch { /* not a URL */ }
  return ''
}

/** Asks a sandboxed activity for a picture of itself; gives up after a few seconds. */
function askSnapshot(frame: HTMLIFrameElement, blockId: string): Promise<{ xhtml: string; height: number }> {
  return new Promise((resolve, reject) => {
    const req = Math.random().toString(36).slice(2)
    const done = () => { clearTimeout(timer); window.removeEventListener('message', onMsg) }
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { tnb?: number; id?: string; type?: string; req?: string; xhtml?: string; height?: number; error?: string } | null
      if (e.source !== frame.contentWindow || !d || d.tnb !== 1 || d.type !== 'snapshot' || d.req !== req || d.id !== blockId) return
      done()
      if (d.xhtml) resolve({ xhtml: d.xhtml, height: d.height ?? 0 }); else reject(new Error(d.error || 'empty'))
    }
    const timer = setTimeout(() => { done(); reject(new Error('timeout')) }, 4000)
    window.addEventListener('message', onMsg)
    frame.contentWindow?.postMessage({ tnb: 1, id: blockId, type: 'snapshot', req }, '*')
  })
}

/**
 * Blocks the PDF engine cannot draw itself (React Flow circuits, Mermaid's HTML
 * labels, iframes) are captured as pictures from the live page, in light colours.
 */
async function pictureBlocks(live: HTMLElement, copy: HTMLElement, byType: Record<string, JsonNode[]>): Promise<void> {
  const html = document.documentElement
  const prev = html.getAttribute('data-theme')
  // What an activity looks like on screen includes its backdrop (dark in dark mode).
  const surface = getComputedStyle(html).getPropertyValue('--c-surface').trim() || '#fff'
  html.setAttribute('data-theme', 'light')
  const stage = document.createElement('div')
  stage.style.cssText = 'position:fixed;left:-99999px;top:0;width:760px'
  document.body.append(stage)
  try {
    // Mermaid draws only near the viewport, so diagrams further down may be empty: render from the code.
    const mm = Array.from(copy.querySelectorAll<HTMLElement>('.mm-block'))
    await Promise.all(mm.map(async (block, i) => {
      try {
        const code = String(byType.mermaid?.[i]?.code ?? '')
        const svgText = await renderMermaid(code, 'light')
        const holder = document.createElement('div')
        holder.className = 'mm-svg'
        holder.innerHTML = svgText
        const svgEl = holder.querySelector('svg')
        stage.append(holder)
        if (svgEl) {
          const vb = (svgEl as SVGSVGElement).viewBox.baseVal
          const wpx = Math.min(vb.width || 600, 700)
          svgEl.setAttribute('width', String(wpx))
          svgEl.setAttribute('height', String(wpx * ((vb.height || 400) / (vb.width || 600))))
          svgEl.removeAttribute('style')
        }
        const url = await rasterize(holder)
        holder.remove()
        block.replaceWith(pictureOf(url, 'pdf-figure'))
      } catch { block.replaceWith(note('This diagram could not be drawn.')) }
    }))

    // Circuits: the live block is captured (wires and parts as they appear on screen).
    const liveCircuits = Array.from(live.querySelectorAll<HTMLElement>('.circuit-block'))
    const copyCircuits = Array.from(copy.querySelectorAll<HTMLElement>('.circuit-block'))
    await Promise.all(copyCircuits.map(async (c, i) => {
      try {
        c.replaceWith(pictureOf(await rasterize(liveCircuits[i].querySelector('.circuit-canvas') as HTMLElement), 'pdf-figure'))
      } catch { c.replaceWith(note('This circuit could not be drawn.')) }
    }))
  } finally {
    stage.remove()
    if (prev) html.setAttribute('data-theme', prev); else html.removeAttribute('data-theme')
  }

  // Interactive HTML activities run in a sandboxed iframe the PDF engine cannot print,
  // so each one is asked for a still picture of itself as it looks on screen now.
  const frames = Array.from(live.querySelectorAll<HTMLIFrameElement>('.html-frame'))
  const stages = Array.from(copy.querySelectorAll<HTMLElement>('.html-stage'))
  await Promise.all(stages.map(async (stage, i) => {
    try {
      const frame = frames[i]
      const id = String(byType.html?.[i]?.blockId ?? '')
      if (!frame?.contentWindow || !id) throw new Error('no frame')
      const snap = await askSnapshot(frame, id)
      const w = Math.max(Math.ceil(frame.getBoundingClientRect().width), 200)
      stage.replaceWith(pictureOf(await rasterizeXhtml(snap.xhtml, w, Math.max(snap.height, 40), surface), 'pdf-figure'))
    } catch { stage.replaceWith(note('Interactive activity: open the document to use it.')) }
  }))
  // Videos and web embeds cannot play on paper: they become a card with the address.
  const embeds = (byType.media ?? []).filter(m => m.kind === 'youtube' || m.kind === 'embed')
  copy.querySelectorAll<HTMLElement>('.media-embed').forEach((el, i) => {
    const m = embeds[i]
    const card = document.createElement('div')
    card.className = 'pdf-embed'
    const label = document.createElement('div'); label.className = 'pdf-embed-label'
    label.textContent = m?.kind === 'youtube' ? 'Video' : 'Web content'
    const title = String(m?.alt ?? '')
    const link = document.createElement('a'); link.className = 'pdf-embed-url'
    link.textContent = String(m?.src ?? '') ; link.href = String(m?.src ?? '')
    card.append(label)
    const thumb = thumbnailFor(String(m?.src ?? ''))
    if (thumb) { const im = document.createElement('img'); im.className = 'pdf-embed-thumb'; im.src = thumb; im.alt = ''; card.append(im) }
    if (title) { const t = document.createElement('div'); t.className = 'pdf-embed-title'; t.textContent = title; card.append(t) }
    card.append(link)
    el.replaceWith(card)
  })
  copy.querySelectorAll('iframe').forEach(f => f.replaceWith(note('Embedded content: open the document to view it.')))

  // Buttons print badly (a form control, not text), so the ones used as labels become spans.
  copy.querySelectorAll<HTMLElement>('button.toc-chip, button.callout-variant-btn, button.quiz-opt').forEach(b => {
    const span = document.createElement(b.classList.contains('quiz-opt') ? 'div' : 'span')
    span.className = b.className
    span.append(...Array.from(b.childNodes))
    b.replaceWith(span)
  })

  // Tabs show one panel at a time on screen; on paper every tab is listed.
  const tabs = byType.tabs ?? []
  copy.querySelectorAll<HTMLElement>('.tabs-pills').forEach((pills, i) => {
    const block = pills.parentElement
    const items = (tabs[i]?.items as { title: string; text: string }[] | undefined) ?? []
    if (!block) return
    block.replaceChildren(...items.map(it => {
      const d = document.createElement('div')
      d.className = 'pdf-tab'
      const h = document.createElement('div'); h.className = 'pdf-tab-title'; h.textContent = it.title
      const t = document.createElement('div'); t.className = 'pdf-tab-text'; t.textContent = it.text
      d.append(h, t)
      return d
    }))
  })
}

/** Quizzes print as a worksheet: options listed, correct one marked, with the reason. */
function printQuizzes(body: HTMLElement, quizzes: { answer: number; why: string }[][]): void {
  body.querySelectorAll<HTMLElement>('.quiz-block').forEach((block, i) => {
    block.querySelectorAll<HTMLElement>('.quiz-q').forEach((qEl, k) => {
      const info = quizzes[i]?.[k]
      if (!info) return
      qEl.querySelectorAll<HTMLElement>('.quiz-opt').forEach((b, j) => {
        b.classList.remove('wrong')
        b.classList.toggle('correct', j === info.answer)
      })
      qEl.querySelectorAll('.quiz-feedback').forEach(f => f.remove())
      const ans = document.createElement('p')
      ans.className = 'quiz-answer'
      const letter = String.fromCharCode(65 + info.answer)
      ans.append(`Answer: ${letter}`)
      if (info.why) { const why = document.createElement('span'); why.textContent = ` — ${info.why}`; ans.append(why) }
      qEl.append(ans)
    })
    block.querySelectorAll('button').forEach(b => { if (b.textContent?.trim() === 'Try again') b.remove() })
  })
}

export async function downloadDocumentPdf(editor: LexicalEditor, title: string): Promise<void> {
  const root = editor.getRootElement()
  if (!root) throw new Error('The document is not ready yet.')
  const { body, quizzes, byType } = prepareBody(editor)
  await pictureBlocks(root, body, byType)
  await printMediaForPdf(body)
  flattenCanvases(root, body)
  printQuizzes(body, quizzes)
  await inlineImages(body)

  let res: Response
  try {
    res = await fetch(`${API}/export/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, html: body.innerHTML, styles: collectStyles(), baseUrl: window.location.origin }),
    })
  } catch {
    throw new Error('Could not reach the backend. Check that it is running.')
  }
  if (!res.ok) {
    const detail = await res.json().then(j => (j as { detail?: string }).detail, () => undefined)
    throw new Error(detail || 'Could not build the PDF.')
  }
  const url = URL.createObjectURL(await res.blob())
  const safe = (title || 'Untitled').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Untitled'
  const link = document.createElement('a')
  link.href = url
  link.download = `${safe}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
