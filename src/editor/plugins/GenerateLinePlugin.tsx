import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  mergeRegister,
} from 'lexical'
import { useEditorUI } from '../context/EditorUIContext'
import { useDocument } from '../../context/DocumentContext'
import { $getRealTopLevelAncestor } from '../blockRegistry'
import { generateBlockAtAnchor } from '../ai/generateBlock'
import { GENERATE_CHOICES } from '../ai/generateChoices'
import { chooseSourceFile, describeSource, knownSources, matchSource, readSourceFile, rememberSource, SourceError } from '../ai/sourceFiles'
import type { SourceFile } from '../ai/sourceFiles'
import type { GenerateChoice } from '../ai/generateChoices'
import type { LexicalEditor } from 'lexical'

// "/generate" and "/agent" as prompt lines inside the document (no second dropdown).
//
// Choosing Generate (or Agent) in the slash menu leaves "/generate " (or "/agent ") on
// the line. While the caret is on such a line, a small panel under it lists what can be
// made. Picking one turns the line into "quiz for " and asks what it is about.
//  - /generate: Enter inserts exactly one block where the line was (generateBlockAtAnchor).
//  - /agent: Enter starts the AI Agent panel, which writes a whole workbook, lesson or
//    lesson plan and asks for Accept before anything lands in the document.
//    "/agent workbook from a file" opens the file dialog; the chosen file's text is what the AI writes from.
// Grey text after the caret suggests the next word: " for", or a variant such as
// "series". Tab accepts it, Up/Down cycle through variants.
//
// A bare type never generates by itself: the teacher must say what it is about.

// The command alone ("/agent") counts too, so the choices show as soon as it is typed.
const LINE = /^\s*\/(generate|agent)(?:\s|$)(.*)$/i
const TOP = 5 // chips shown before "+N more"

// Most used first, so the five shown by default are the ones teachers reach for.
const ORDER = ['Quiz', 'Table', 'Circuit', 'Graph', 'Drawing']
const CHOICES: GenerateChoice[] = [
  ...ORDER.map(l => GENERATE_CHOICES.find(c => c.label === l)).filter((c): c is GenerateChoice => !!c),
  ...GENERATE_CHOICES.filter(c => !ORDER.includes(c.label)),
]
type Cmd = 'generate' | 'agent'
type AgentKind = 'workbook' | 'lesson' | 'lesson_plan'

/** Something the chips offer: one block type (generate) or one kind of whole document (agent). */
export interface Item { label: string; desc?: string; choice?: GenerateChoice; kind?: AgentKind }
const ITEMS: Record<Cmd, Item[]> = {
  generate: CHOICES.map(choice => ({ label: choice.label, choice })),
  agent: [
    { label: 'Workbook', kind: 'workbook', desc: 'Exercises and an answer key for students to fill in' },
    { label: 'Lesson builder', kind: 'lesson', desc: 'A full lesson: explanation, examples and quick checks' },
    { label: 'Lesson plan', kind: 'lesson_plan', desc: 'A timed plan with objectives, activities and homework' },
  ],
}
const nameOf = (c: Item) => c.label.toLowerCase()

// Variants offered as grey text after "<type> for ".
const VARIANTS: Record<string, string[]> = {
  circuit: ['series', 'parallel', 'switch and bulb'],
  quiz: ['5 questions', 'true or false'],
  table: ['comparison', 'timetable'],
  graph: ['linear', 'quadratic'],
  chart: ['bar chart', 'pie chart'],
}

export interface Parsed { choice: Item | null; topic: string | null }

/** Splits what follows "/generate " into a known block type and what comes after "for". */
export function parse(rest: string, cmd: Cmd = 'generate'): Parsed {
  const s = rest.replace(/^\s+/, '')
  const lower = s.toLowerCase()
  // Longest label first, so "chemical equation" is never taken for a shorter name.
  const byLen = [...ITEMS[cmd]].sort((a, b) => b.label.length - a.label.length)
  for (const c of byLen) {
    const n = nameOf(c)
    if (lower === n || lower.startsWith(n + ' ')) {
      const tail = s.slice(n.length)
      const m = tail.match(/^\s+for(?:\s+([\s\S]*))?$/i)
      return { choice: c, topic: m ? (m[1] ?? '') : null }
    }
  }
  return { choice: null, topic: null }
}

export interface Ghost { text: string; full: string | null; count: number }

const FILE_PHRASE = 'from a file'

/** "/agent workbook from <file>": the text after "from ", or null when the line is not a "from" line. */
export function fileRequest(rest: string): { choice: Item; from: string } | null {
  const { choice, topic } = parse(rest, 'agent')
  if (!choice || topic !== null) return null
  const tail = rest.replace(/^\s+/, '').slice(nameOf(choice).length)
  const m = tail.match(/^\s+from(?:\s+([\s\S]*))?$/i)
  return m ? { choice, from: (m[1] ?? '').trim() } : null
}

/** Grey suggestions after an agent type: " for <topic>" or " from a file", whichever the typing leads to. */
function agentGhost(choice: Item, rest: string, variantIdx: number): Ghost | null {
  const name = nameOf(choice)
  const tail = rest.replace(/^\s+/, '').slice(name.length)
  const typed = tail.replace(/^\s+/, '').toLowerCase()
  const options: { text: string; full: string }[] = []
  if (typed === '') options.push({ text: /\s$/.test(rest) ? 'for ' : ' for', full: `${name} for ` })
  else if ('for '.startsWith(typed) && typed !== 'for') options.push({ text: 'for '.slice(typed.length), full: `${name} for ` })
  if (typed === '') options.push({ text: /\s$/.test(rest) ? FILE_PHRASE : ` ${FILE_PHRASE}`, full: `${name} ${FILE_PHRASE}` })
  else if (FILE_PHRASE.startsWith(typed) && typed !== FILE_PHRASE) options.push({ text: FILE_PHRASE.slice(typed.length), full: `${name} ${FILE_PHRASE}` })
  if (!options.length) return null
  return { ...options[variantIdx % options.length], count: options.length }
}

export function ghostFor(rest: string, variantIdx: number, cmd: Cmd = 'generate'): Ghost | null {
  const { choice, topic } = parse(rest, cmd)
  if (!choice) return null
  if (topic === null) {
    if (cmd === 'agent') return agentGhost(choice, rest, variantIdx)
    return { text: /\s$/.test(rest) ? 'for ' : ' for', full: `${nameOf(choice)} for `, count: 1 }
  }
  const variants = cmd === 'generate' ? (VARIANTS[nameOf(choice)] ?? []) : []
  const options = variants.filter(v => v.startsWith(topic.toLowerCase()) && v.length > topic.length)
  if (options.length) {
    const v = options[variantIdx % options.length]
    return { text: v.slice(topic.length), full: `${nameOf(choice)} for ${v}`, count: options.length }
  }
  return null
}

interface Active { key: string; rest: string; cmd: Cmd }
interface Review { key: string; choice: GenerateChoice; topic: string }

export function GenerateLinePlugin() {
  const [editor] = useLexicalComposerContext()
  const { update: updateUI } = useEditorUI()
  const { activeDocId, setAiState, aiAbortRef } = useDocument()
  const [active, setActive] = useState<Active | null>(null)
  const [idx, setIdx] = useState(0)
  const [variantIdx, setVariantIdx] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  // The line whose generation is running: shown as "Generating …" on that empty line.
  const [busy, setBusy] = useState<{ key: string; label: string; topic: string } | null>(null)
  // The block that was just written and is waiting for Accept / Regenerate / Edit / Discard.
  const [review, setReview] = useState<Review | null>(null)
  // "/agent ... from a file": the file being read, files added so far, and a problem with a file.
  const [reading, setReading] = useState<string | null>(null)
  const [files, setFiles] = useState<readonly SourceFile[]>(() => [...knownSources()])
  const [fileProblem, setFileProblem] = useState<{ text: string; rest: string } | null>(null)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; caretX: number; caretY: number; caretH: number } | null>(null)

  // Command handlers are registered once, so they read the latest state from here.
  const reviewRef = useRef<Review | null>(null)
  reviewRef.current = review
  const live = useRef({ active, idx, variantIdx, expanded, dismissed })
  live.current = { active, idx, variantIdx, expanded, dismissed }
  const hooks = useRef({ activeDocId, setAiState, aiAbortRef, updateUI })
  hooks.current = { activeDocId, setAiState, aiAbortRef, updateUI }

  // Which block types the chips show for what has been typed.
  const typed = (active?.rest ?? '').trim().toLowerCase()
  const cmd: Cmd = active?.cmd ?? 'generate'
  const parsed = parse(active?.rest ?? '', cmd)
  const matches = ITEMS[cmd].filter(c => !typed || nameOf(c).includes(typed))
  const hasMore = !typed && matches.length > TOP
  const shown = hasMore && !expanded ? matches.slice(0, TOP) : matches
  // Chips are listed while no complete type is on the line; after that the grey text takes over.
  const chipsVisible = !!active && !dismissed && !parsed.choice && shown.length > 0
  const navCount = shown.length + (hasMore ? 1 : 0)
  const toggleIdx = hasMore ? shown.length : -1
  const liveNav = useRef({ shown, navCount, toggleIdx, chipsVisible })
  liveNav.current = { shown, navCount, toggleIdx, chipsVisible }

  const ghost = active ? ghostFor(active.rest, variantIdx, cmd) : null

  const setLine = useCallback((key: string, command: Cmd, text: string) => {
    editor.update(() => {
      const p = $getNodeByKey(key)
      if (!$isParagraphNode(p)) return
      p.clear()
      p.append($createTextNode(`/${command} ${text}`))
      p.selectEnd()
    })
  }, [editor])

  // Which paragraph the caret is on, and whether it is a "/generate" or "/agent" line.
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      const next = editorState.read((): Active | null => {
        if (!editor.isEditable()) return null
        const sel = $getSelection()
        if (!$isRangeSelection(sel) || !sel.isCollapsed()) return null
        const top = $getRealTopLevelAncestor(sel.anchor.getNode())
        if (!top || !$isParagraphNode(top)) return null
        const m = LINE.exec(top.getTextContent())
        return m ? { key: top.getKey(), rest: m[2], cmd: m[1].toLowerCase() as Cmd } : null
      })
      setActive(prev => (prev?.key === next?.key && prev?.rest === next?.rest && prev?.cmd === next?.cmd ? prev : next))
    })
  }, [editor])

  // Typing resets the highlight and brings a dismissed panel back.
  useEffect(() => { setIdx(0); setVariantIdx(0); setDismissed(false) }, [active?.rest, active?.key])
  useEffect(() => { if (!active) setExpanded(false) }, [active])

  // Place the panel under the line and the grey text at the caret.
  useEffect(() => {
    if (!active) { setPos(null); return }
    const measure = () => {
      const el = editor.getElementByKey(active.key)
      if (!el) { setPos(null); return }
      const r = el.getBoundingClientRect()
      const sel = window.getSelection()
      let cx = r.left, cy = r.top, ch = r.height
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0).cloneRange()
        range.collapse(false)
        const rects = range.getClientRects()
        const cr = rects.length ? rects[rects.length - 1] : null
        if (cr && cr.height) { cx = cr.right; cy = cr.top; ch = cr.height }
      }
      // Under the line; above it when the line is near the bottom of the screen.
      const below = window.innerHeight - r.bottom
      const flip = below < 240 && r.top > below
      setPos({
        left: Math.max(8, Math.min(r.left, window.innerWidth - 480)),
        ...(flip ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
        caretX: cx, caretY: cy, caretH: ch,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    // Braces matter: Lexical treats anything an update listener returns as its cleanup function.
    const off = editor.registerUpdateListener(() => { requestAnimationFrame(measure) })
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); off() }
  }, [active, editor])

  const pick = useCallback((i: number) => {
    const { shown: list, toggleIdx: ti } = liveNav.current
    const a = live.current.active
    if (!a) return
    if (i === ti) { setExpanded(e => !e); return }
    const c = list[i]
    // /agent leaves the line as "workbook " so the grey suggestions ("for", "from a file") stay a choice.
    if (c) setLine(a.key, a.cmd, a.cmd === 'agent' ? `${nameOf(c)} ` : `${nameOf(c)} for `)
  }, [setLine])

  // Writes one block on the empty line `anchorKey`, then leaves it up for review.
  const startGenerate = useCallback((anchorKey: string, choice: GenerateChoice, topic: string) => {
    const h = hooks.current
    setReview(null)
    // The empty line shows progress (see BusyLine); the side panel is left alone.
    setBusy({ key: anchorKey, label: choice.label, topic })
    // A line near the bottom edge would show its progress half cut off: bring it up first.
    const line = editor.getElementByKey(anchorKey)
    if (line && line.getBoundingClientRect().bottom > window.innerHeight - 200) line.scrollIntoView({ block: 'center', behavior: 'smooth' })
    void generateBlockAtAnchor(editor, anchorKey, choice, topic, { docId: h.activeDocId, setAiState: h.setAiState, aiAbortRef: h.aiAbortRef })
      .then(key => {
        setBusy(null)
        if (!key) return
        reveal(editor, key)
        setReview({ key, choice, topic })
      })
  }, [editor])

  const run = useCallback((a: Active, item: Item, topic: string, sources?: { name: string; text: string }[]) => {
    editor.update(() => {
      const p = $getNodeByKey(a.key)
      if ($isParagraphNode(p)) p.clear() // leaves an empty line: that is where the block lands
    })
    const h = hooks.current
    if (item.kind) {
      // Agent: the side panel writes the whole document and asks for Accept before anything lands.
      h.updateUI({ agent: { id: Date.now(), run: { kind: item.kind, prompt: topic, sources } }, activeMath: null, activeModel3d: null })
      return
    }
    if (item.choice) startGenerate(a.key, item.choice, topic)
  }, [editor, startGenerate])

  // Accept keeps the block; Regenerate / Edit prompt / Discard take it out again.
  const reviewAct = useCallback((act: 'accept' | 'regen' | 'edit' | 'discard') => {
    const r = reviewRef.current
    if (!r) return
    if (act === 'accept') {
      setReview(null)
      const el = editor.getElementByKey(r.key)
      if (el) { el.classList.add('gl-accepted'); setTimeout(() => el.classList.remove('gl-accepted'), 1200) }
      return
    }
    let lineKey: string | null = null
    editor.update(() => {
      const node = $getNodeByKey(r.key)
      if (!node) return
      const line = $createParagraphNode()
      if (act === 'edit') line.append($createTextNode(`/generate ${r.choice.label.toLowerCase()} for ${r.topic}`))
      node.replace(line)
      lineKey = line.getKey()
      if (act === 'regen') return
      line.selectEnd()
    })
    setReview(null)
    if (act === 'regen' && lineKey) startGenerate(lineKey, r.choice, r.topic)
  }, [editor, startGenerate])

  // Opens the file dialog, reads the file, and puts its name on the line: "workbook from Notes.pdf ".
  const pickFile = useCallback(async (a: Active, item: Item) => {
    const file = await chooseSourceFile()
    editor.focus()
    if (!file) return
    setReading(file.name)
    try {
      const src = rememberSource(await readSourceFile(file))
      setFiles([...knownSources()])
      setLine(a.key, a.cmd, `${nameOf(item)} from ${src.name} `)
    } catch (err) {
      const text = err instanceof SourceError ? err.message : `${file.name} could not be read.`
      setFileProblem({ text, rest: live.current.active?.rest ?? a.rest })
    } finally {
      setReading(null)
    }
  }, [editor, setLine])

  const submit = useCallback(() => {
    const { active: a, variantIdx: vi } = live.current
    if (!a || reading) return
    const p = parse(a.rest, a.cmd)
    if (!p.choice) return
    const fromFile = a.cmd === 'agent' ? fileRequest(a.rest) : null
    const wantsFile = fromFile ?? (ghostFor(a.rest, vi, a.cmd)?.full?.endsWith(FILE_PHRASE) && !p.topic ? { choice: p.choice, from: '' } : null)
    if (wantsFile) {
      const found = matchSource(wantsFile.from)
      if (found) {
        const { source, rest } = found
        run(a, p.choice, `${p.choice.label} from ${source.name}${rest ? `. ${rest}` : ''}`, [{ name: source.name, text: source.text }])
      } else if (!wantsFile.from || /^a file$/i.test(wantsFile.from)) {
        void pickFile(a, p.choice)
      } else {
        setFileProblem({ text: `No file called “${wantsFile.from}” was added yet. Type “from a file” to choose one.`, rest: a.rest })
      }
      return
    }
    const topic = (p.topic ?? '').trim()
    if (topic) { run(a, p.choice, topic); return }
    // A bare type is not enough: use the grey suggestion if there is one, otherwise ask.
    const g = ghostFor(a.rest, vi, a.cmd)
    if (g?.full) { const t = parse(g.full, a.cmd).topic?.trim(); if (t) { run(a, p.choice, t); return } }
    setLine(a.key, a.cmd, `${nameOf(p.choice)} for `)
  }, [run, setLine, pickFile, reading])

  useEffect(() => {
    const when = (fn: (e: KeyboardEvent | null) => boolean) => (e: KeyboardEvent | null) => (live.current.active ? fn(e) : false)
    return mergeRegister(
      editor.registerCommand(KEY_ARROW_DOWN_COMMAND, when(e => step(1, e)), COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(KEY_ARROW_UP_COMMAND, when(e => step(-1, e)), COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(KEY_ENTER_COMMAND, when(e => {
        if (e?.shiftKey) return false
        e?.preventDefault()
        const { chipsVisible: chips } = liveNav.current
        if (chips) pick(live.current.idx)
        else submit()
        return true
      }), COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(KEY_TAB_COMMAND, when(e => {
        const a = live.current.active
        if (!a) return false
        const g = ghostFor(a.rest, live.current.variantIdx, a.cmd)
        if (g?.full) {
          e?.preventDefault()
          setLine(a.key, a.cmd, g.full)
          const choice = parse(g.full, a.cmd).choice
          if (g.full.endsWith(FILE_PHRASE) && choice) void pickFile(a, choice)
          return true
        }
        if (liveNav.current.chipsVisible) { e?.preventDefault(); pick(live.current.idx); return true }
        return false
      }), COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(KEY_ESCAPE_COMMAND, when(() => {
        if (live.current.dismissed) return false
        setDismissed(true)
        return true
      }), COMMAND_PRIORITY_CRITICAL),
    )
    function step(dir: 1 | -1, e: KeyboardEvent | null): boolean {
      const a = live.current.active
      if (!a) return false
      const g = ghostFor(a.rest, live.current.variantIdx, a.cmd)
      if (g && g.count > 1) {
        e?.preventDefault()
        setVariantIdx(v => (v + dir + g.count) % g.count)
        return true
      }
      const { chipsVisible: chips, navCount: n } = liveNav.current
      if (!chips || n === 0) return false
      e?.preventDefault()
      setIdx(i => (i + dir + n) % n)
      return true
    }
  }, [editor, pick, submit, setLine, pickFile])

  const reviewBar = review ? <ReviewBar editor={editor} review={review} onAct={reviewAct} /> : null
  if (!active || !pos) return <>{busy && <BusyLine editor={editor} busy={busy} />}{reviewBar}</>
  // Once a complete type and topic are on the line, say what Enter will do, so the line never looks dead.
  const topicNow = (parsed.topic ?? '').trim()
  const fromFile = cmd === 'agent' ? fileRequest(active.rest) : null
  const found = fromFile ? matchSource(fromFile.from) : null
  const problem = fileProblem && fileProblem.rest === active.rest ? fileProblem.text : null
  const readyLabel = reading
    ? `Reading ${reading}…`
    : problem
      ? problem
      : fromFile
        ? (found
          ? `Enter to write a ${fromFile.choice.label.toLowerCase()} from ${found.source.name} (${describeSource(found.source)}) in the AI panel${found.rest ? ` · ${found.rest}` : ''}${found.source.truncated ? '. Only the first part of this long file is used.' : ''}`
          : (!fromFile.from || /^a file$/i.test(fromFile.from) ? 'Enter to choose a file (PDF, DOCX, TXT or MD, up to 10 MB)' : null))
        : parsed.choice && topicNow
          ? (cmd === 'agent'
            ? `Enter to write a ${parsed.choice.label.toLowerCase()} about “${topicNow}” in the AI panel`
            : `Enter to add a ${parsed.choice.label.toLowerCase()} about “${topicNow}”`)
          : null
  // Files added earlier can be picked again instead of choosing the file a second time.
  const fileChips = !!fromFile && !found && !reading && files.length > 0
  const showPanel = chipsVisible || fileChips || (!dismissed && readyLabel)

  return createPortal(
    <>
      {busy && <BusyLine editor={editor} busy={busy} />}
      {reviewBar}
      {ghost && (
        <span
          className="slash-ghost gl-ghost"
          style={{ left: pos.caretX + 2, top: pos.caretY, height: pos.caretH, lineHeight: `${pos.caretH}px` }}
          aria-hidden="true"
        >
          {ghost.text}
          {ghost.count > 1 && <span className="gl-ghost-count">  ↑↓ {ghost.count} options · Tab</span>}
        </span>
      )}
      {showPanel && (
        <div
          className="gl-panel"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}
          role="listbox"
          aria-label={cmd === 'agent' ? 'What to create' : 'Block types'}
          onMouseDown={e => e.preventDefault()} // keep the caret in the document
        >
          {chipsVisible && (
            <>
              <div className="gl-label">{cmd === 'agent' ? 'Write a whole document' : 'Add one block'}</div>
              <div className="gl-chips">
                {shown.map((c, i) => (
                  <button
                    key={c.label}
                    type="button"
                    role="option"
                    aria-selected={i === idx}
                    className={`gl-chip${i === idx ? ' on' : ''}`}
                    onMouseMove={() => { if (i !== idx) setIdx(i) }}
                    onClick={() => pick(i)}
                  >
                    {c.label}
                  </button>
                ))}
                {hasMore && (
                  <button
                    type="button"
                    className={`gl-chip more${idx === toggleIdx ? ' on' : ''}`}
                    onMouseMove={() => { if (idx !== toggleIdx) setIdx(toggleIdx) }}
                    onClick={() => setExpanded(e => !e)}
                  >
                    {expanded ? 'show less ↑' : `+${matches.length - TOP} more ↓`}
                  </button>
                )}
              </div>
              {shown[idx]?.desc && <div className="gl-desc">{shown[idx].desc}</div>}
              <div className="gl-keys"><kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>Enter</kbd> pick · <kbd>Esc</kbd> hide</div>
            </>
          )}
          {fileChips && fromFile && (
            <>
              <div className="gl-label">Use a file</div>
              <div className="gl-chips">
                {files.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    className="gl-chip"
                    onClick={() => { setLine(active.key, 'agent', `${nameOf(fromFile.choice)} from ${f.name} `); editor.focus() }}
                  >
                    {f.name}
                  </button>
                ))}
                <button type="button" className="gl-chip more" onClick={() => { void pickFile(active, fromFile.choice) }}>Choose another…</button>
              </div>
            </>
          )}
          {!chipsVisible && readyLabel && <div className="gl-note" role={problem ? 'alert' : 'status'}>{readyLabel}</div>}
        </div>
      )}
    </>,
    document.body,
  )
}

/** Brings the new block into view and flashes it, so it is never left below the fold. */
function reveal(editor: LexicalEditor, key: string) {
  requestAnimationFrame(() => {
    const el = editor.getElementByKey(key)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.add('gl-flash')
    setTimeout(() => el.classList.remove('gl-flash'), 1600)
  })
}

/** "Generating quiz…" shown on the empty line where the block will land. */
function BusyLine({ editor, busy }: { editor: LexicalEditor; busy: { key: string; label: string; topic: string } }) {
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const el = editor.getElementByKey(busy.key)
      if (!el) { setRect(null); return }
      const r = el.getBoundingClientRect()
      setRect({ left: r.left, top: r.top, width: r.width })
    }
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    const off = editor.registerUpdateListener(() => { requestAnimationFrame(measure) })
    return () => { window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure); off() }
  }, [editor, busy.key])
  if (!rect) return null
  return createPortal(
    <div className="gl-busy" style={{ left: rect.left, top: rect.top, width: rect.width }} role="status">
      <span className="gl-busy-dot" aria-hidden="true" />
      Generating {busy.label.toLowerCase()} for {busy.topic}…
    </div>,
    document.body,
  )
}

/** Outlines the freshly written block and puts Accept / Regenerate / Edit prompt / Discard under it. */
function ReviewBar({ editor, review, onAct }: { editor: LexicalEditor; review: Review; onAct: (a: 'accept' | 'regen' | 'edit' | 'discard') => void }) {
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const el = editor.getElementByKey(review.key)
      if (!el) { setRect(null); return }
      const r = el.getBoundingClientRect()
      setRect({ left: r.left, top: Math.min(r.bottom + 8, window.innerHeight - 56), width: r.width })
    }
    editor.getElementByKey(review.key)?.classList.add('gl-pending')
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    const off = editor.registerUpdateListener(() => { requestAnimationFrame(measure) })
    return () => {
      window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure); off()
      editor.getElementByKey(review.key)?.classList.remove('gl-pending')
    }
  }, [editor, review.key])
  if (!rect) return null
  return createPortal(
    <div className="gl-review" style={{ left: rect.left, top: rect.top, width: rect.width }} role="group" aria-label={`${review.choice.label} draft`}>
      <button type="button" className="gl-btn primary" onClick={() => onAct('accept')}>✓ Accept</button>
      <button type="button" className="gl-btn" onClick={() => onAct('regen')}>↻ Regenerate</button>
      <button type="button" className="gl-btn" onClick={() => onAct('edit')}>✎ Edit prompt</button>
      <span className="gl-grow" />
      <button type="button" className="gl-btn" onClick={() => onAct('discard')}>Discard</button>
    </div>,
    document.body,
  )
}
