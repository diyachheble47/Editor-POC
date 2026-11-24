// Export the document as a single, standalone HTML file.
//
// It takes the document as it is rendered on screen (the editor's own DOM), copies
// the app's stylesheets into the file, strips the editing-only controls, and downloads
// the result. Blocks that draw on a <canvas> or load live data may not survive the
// copy exactly; the printed PDF path (PreviewModal) is the reference for those.

import type { LexicalEditor } from 'lexical'

/** Every CSS rule the page has loaded, as text. Cross-origin sheets are skipped. */
export function collectStyles(): string {
  const parts: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) parts.push(rule.cssText)
    } catch {
      // A sheet from another origin cannot be read; the document only loses that sheet.
    }
  }
  return parts.join('\n')
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/** Makes the quizzes answer back in the exported file (no app code needed). */
const QUIZ_SCRIPT = `
document.querySelectorAll('.quiz-block').forEach(function (block) {
  var answers = [];
  try { answers = JSON.parse(block.getAttribute('data-quiz') || '[]'); } catch (e) {}
  block.querySelectorAll('.quiz-q').forEach(function (qEl, k) {
    var info = answers[k];
    if (!info) return;
    var opts = qEl.querySelectorAll('.quiz-opt');
    var feedback = qEl.querySelector('.quiz-feedback');
    opts.forEach(function (btn, j) {
      btn.addEventListener('click', function () {
        if (qEl.getAttribute('data-done')) return;
        qEl.setAttribute('data-done', '1');
        opts.forEach(function (b, jj) {
          b.disabled = true;
          if (jj === info.answer) b.classList.add('correct');
          else if (jj === j) b.classList.add('wrong');
        });
        if (feedback) feedback.textContent = (j === info.answer ? 'Correct. ' : 'Not quite. ') + (info.why || '');
      });
    });
  });
  var retry = Array.prototype.find.call(block.querySelectorAll('button'), function (b) { return b.textContent.trim() === 'Try again'; });
  if (retry) retry.addEventListener('click', function () {
    block.querySelectorAll('.quiz-q').forEach(function (qEl) {
      qEl.removeAttribute('data-done');
      qEl.querySelectorAll('.quiz-opt').forEach(function (b) { b.disabled = false; b.classList.remove('correct', 'wrong'); });
      var f = qEl.querySelector('.quiz-feedback'); if (f) f.textContent = '';
    });
  });
});
`

type QuizData = { q: string; answer: number; why: string }[]

/** The document's DOM, cleaned of editing controls, plus its quizzes' answers. */
export type JsonNode = { type?: string; children?: unknown[]; [k: string]: unknown }

export function prepareBody(editor: LexicalEditor): { body: HTMLElement; quizzes: QuizData[]; byType: Record<string, JsonNode[]> } {
  const root = editor.getRootElement()
  if (!root) throw new Error('The document is not ready yet.')

  // Quiz answers live in the document data, not in the DOM, so they are read here
  // (in document order, the same order the blocks are rendered) and handed to the page.
  const quizzes: QuizData[] = []
  const byType: Record<string, JsonNode[]> = {}
  const walk = (n: JsonNode) => {
    if (n.type) (byType[n.type] ??= []).push(n)
    if (n.type === 'quiz') quizzes.push((n.questions as QuizData) ?? [])
    ;(n.children ?? []).forEach(c => walk(c as JsonNode))
  }
  walk(editor.getEditorState().toJSON().root as JsonNode)

  const body = root.cloneNode(true) as HTMLElement
  // Editing-only UI: resize corners, edit buttons and forms, Mermaid's inline editor.
  body.querySelectorAll('.rz-handle, .mm-editor, .html-edit-pill, .img-replace, .rb-edit, .rb-form').forEach(el => el.remove())
  body.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'))
  body.removeAttribute('id')
  return { body, quizzes, byType }
}

/** Builds the HTML text of the document as it currently stands. */
export function documentToHtml(editor: LexicalEditor, title: string): string {
  const { body, quizzes } = prepareBody(editor)
  // Every quiz starts fresh in the file, with its answers attached.
  body.querySelectorAll<HTMLElement>('.quiz-block').forEach((block, i) => {
    const answers = (quizzes[i] ?? []).map(q => ({ answer: q.answer, why: q.why }))
    block.setAttribute('data-quiz', JSON.stringify(answers))
    block.querySelectorAll<HTMLButtonElement>('.quiz-opt').forEach(b => { b.disabled = false; b.classList.remove('correct', 'wrong') })
    block.querySelectorAll('.quiz-feedback').forEach(f => { f.textContent = '' })
  })

  const name = escapeHtml(title || 'Untitled')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
${collectStyles()}
body { margin: 0; background: var(--c-ground); color: var(--c-text); font-family: var(--font-ui); }
.export-page { max-width: 780px; margin: 0 auto; padding: 48px 24px; background: var(--c-surface); min-height: 100vh; }
@media (max-width: 640px) { .export-page { padding: 24px 16px; } }
</style>
</head>
<body>
<main class="export-page">
<h1 class="page-document-title-input" style="border:0;background:none;padding:0;margin:0 0 24px;font-size:28px;font-weight:700;">${name}</h1>
<div class="editor-input">${body.innerHTML}</div>
</main>
<script>${QUIZ_SCRIPT}</script>
</body>
</html>
`
}

/** Downloads the document as "<title>.html". */
export function downloadDocumentHtml(editor: LexicalEditor, title: string): void {
  const html = documentToHtml(editor, title)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const safe = (title || 'Untitled').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Untitled'
  const link = document.createElement('a')
  link.href = url
  link.download = `${safe}.html`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
