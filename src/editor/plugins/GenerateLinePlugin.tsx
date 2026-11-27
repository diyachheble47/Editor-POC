import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles } from 'lucide-react'
import { BlockIcon, rowIconKey } from '../blockIcons'
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
/** A second command typed after the first one: it replaces it. */
const SWITCH = /^\s*\/(generate|agent)(?:\s(.*))?$/i

// Most used first, so the five shown by default are the ones teachers reach for.
const ORDER = ['Quiz', 'Table', 'Circuit', 'Graph', 'Drawing']
const CHOICES: GenerateChoice[] = [
  ...ORDER.map(l => GENERATE_CHOICES.find(c => c.label === l)).filter((c): c is GenerateChoice => !!c),
  ...GENERATE_CHOICES.filter(c => !ORDER.includes(c.label)),
]
type Cmd = 'generate' | 'agent'
type AgentKind = 'workbook' | 'lesson' | 'lesson_plan'

/** Something the chips offer: one block type (generate) or one kind of whole document (agent). */
export interface Item { label: string; desc?: string; choice?: GenerateChoice; kind?: AgentKind; /** A list row that writes this item from a file the teacher chooses. */ fromFileOf?: Item }
const ITEMS: Record<Cmd, Item[]> = {
  generate: CHOICES.map(choice => ({ label: choice.label, choice })),
  agent: [
    { label: 'Workbook', kind: 'workbook', desc: 'Exercises and an answer key for students to fill in' },
    { label: 'Lesson builder', kind: 'lesson', desc: 'A full lesson: explanation, examples and quick checks' },
    { label: 'Lesson plan', kind: 'lesson_plan', desc: 'A timed plan with objectives, activities and homework' },
  ],
}
/** Shown after the three kinds in the /agent list, in muted text: the same documents, written from a file. */
const FILE_ITEMS: Item[] = ITEMS.agent.map(it => ({ label: `${it.label} from a file`, desc: 'Choose a PDF, DOCX, TXT or MD', fromFileOf: it }))
const nameOf = (c: Item) => c.label.toLowerCase()

// After "/agent workbook" the line offers a sentence with blanks to fill in (Tab moves between them).
type TemplatePart = string | { hint: string }
const BASE_TEMPLATE: TemplatePart[] = ['on', { hint: 'e.g. Photosynthesis' }, 'for', { hint: 'e.g. Class 8' }, 'students']
const TEMPLATES: Record<AgentKind, TemplatePart[]> = {
  workbook: BASE_TEMPLATE,
  lesson: BASE_TEMPLATE,
  lesson_plan: [...BASE_TEMPLATE, 'for', { hint: 'e.g. 45 minutes' }],
}

/** The request the AI is given, from the blanks that were filled (only the topic is required). */
export function composeAgentPrompt(kind: AgentKind, values: string[], extra: string): string {
  const [topic = '', who = '', length = ''] = values.map(v => v.trim())
  let out = topic
  if (who) out += ` for ${who} students`
  if (kind === 'lesson_plan' && length) out += `, ${length} long`
  const more = extra.trim()
  return more ? `${out}. ${more}` : out
}

// Variants offered as grey text after "<type> for ".
const VARIANTS: Record<string, string[]> = {
  circuit: ['series', 'parallel', 'switch and bulb'],
  quiz: ['5 questions', 'true or false'],
  table: ['comparison', 'timetable'],
  graph: ['linear', 'quadratic'],
  chart: ['bar chart', 'pie chart'],
}

// Two ways to ask /agent for a document, kept side by side so they can be compared:
//   'blanks'  after the type, a sentence with blanks to fill in (Tab moves between them)
//   'ghost'   after the type, the teacher just types the topic and grey text suggests the rest, "on the go"
export type AgentStyle = 'blanks' | 'ghost'
const STYLE_KEY = 'editor-poc:agent-style'
export function loadAgentStyle(): AgentStyle {
  try { return localStorage.getItem(STYLE_KEY) === 'ghost' ? 'ghost' : 'blanks' } catch { return 'blanks' }
}
function saveAgentStyle(style: AgentStyle) {
  try { localStorage.setItem(STYLE_KEY, style) } catch { /* private window: the choice just is not remembered */ }
}
// Read by parse() and ghostFor(); set from the plugin each render. The default keeps them as they were.
let looseAgent = false
export function setLooseAgent(on: boolean) { looseAgent = on }

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
      if (m) return { choice: c, topic: m[1] ?? '' }
      // "ghost" style: whatever follows the type is the topic ("workbook circuits"), unless it starts a "from <file>" request.
      const bare = tail.trim()
      if (looseAgent && cmd === 'agent' && bare && !/^from(\s|$)/i.test(bare)) return { choice: c, topic: bare }
      return { choice: c, topic: null }
    }
  }
  return { choice: null, topic: null }
}

/** `blank`: the part of `text` that is shown underlined (a value to edit); `select`: the same part inside `full`. */
export interface Ghost { text: string; full: string | null; count: number; blank?: [number, number]; select?: [number, number] }

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

/** Who the suggestion after a topic is written for. The class is the part the teacher is likely to change. */
const CLASSES = ['Class 8', 'Class 4', 'Class 6', 'Class 10']
const hasFor = (t: string) => /\sfor\s/i.test(` ${t} `)

/** "ghost" style, after "workbook for ": a hint for the topic, then " for Class 8 students" once there is one. */
function agentGhostLoose(choice: Item, rest: string, variantIdx: number): Ghost | null {
  const name = nameOf(choice)
  const tail = rest.replace(/^\s+/, '').slice(name.length).trim()
  const gap = /\s$/.test(rest) ? '' : ' '
  const topic = tail.replace(/^for\b\s*/i, '')
  if (!topic) return { text: `${gap}e.g. Photosynthesis`, full: null, count: 1 }
  if (hasFor(topic)) return null
  const partial = /\s(f|fo|for)$/i.exec(tail)
  const base = partial ? tail.slice(0, partial.index) : tail
  const typed = partial ? partial[1].toLowerCase() : ''
  const options = CLASSES
    .map(c => ({ c, v: choice.kind === 'lesson_plan' ? `for ${c} students, 45 minutes` : `for ${c} students` }))
    .filter(o => o.v.startsWith(typed))
  if (!options.length) return null
  const { c, v } = options[variantIdx % options.length]
  const text = (partial ? '' : gap) + v.slice(typed.length)
  const inV = v.indexOf(c)
  const full = `${name} ${base} ${v}`
  const fromText = text.length - (v.length - inV)
  const fromFull = full.length - (v.length - inV)
  return {
    text, full, count: options.length,
    blank: [fromText, fromText + c.length],
    select: [fromFull, fromFull + c.length],
  }
}

export function ghostFor(rest: string, variantIdx: number, cmd: Cmd = 'generate'): Ghost | null {
  const { choice, topic } = parse(rest, cmd)
  if (!choice) return null
  if (looseAgent && cmd === 'agent') return agentGhostLoose(choice, rest, variantIdx)
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

/** `atEnd`: the caret is at the end of the line (nothing is written after it). */
interface Active { key: string; rest: string; cmd: Cmd; atEnd: boolean }
/** The grey suggestion for the line, only while the caret is at its end. */
function ghostAt(a: Active, variantIdx: number): Ghost | null {
  return a.atEnd ? ghostFor(a.rest, variantIdx, a.cmd) : null
}

interface Review { key: string; choice: GenerateChoice; topic: string }

export function GenerateLinePlugin() {
  const [editor] = useLexicalComposerContext()
  const { update: updateUI } = useEditorUI()
  const { activeDocId, setAiState, aiAbortRef } = useDocument()
  const [active, setActive] = useState<Active | null>(null)
  const [agentStyle, setAgentStyleState] = useState<AgentStyle>(loadAgentStyle)
  setLooseAgent(agentStyle === 'ghost')
  const [idx, setIdx] = useState(0)
  const [variantIdx, setVariantIdx] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  // The line whose generation is running: shown as "Generating …" on that empty line.
  const [busy, setBusy] = useState<{ key: string; label: string; topic: string } | null>(null)
  // The block that was just written and is waiting for Accept / Regenerate / Edit / Discard.
  const [review, setReview] = useState<Review | null>(null)
  // "/agent ... from a file": the file being read, files added so far, and a problem with a file.
  const [reading, setReading] = useState<string | null>(null)
  const [files, setFiles] = useState<readonly SourceFile[]>(() => [...knownSources()])
  const [fileProblem, setFileProblem] = useState<{ text: string; rest: string } | null>(null)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; caretX: number; caretY: number; caretH: number; lineLeft: number; lineTop: number; lineH: number; font: string; cmdLeft: number; cmdWidth: number; shift: number } | null>(null)

  // Command handlers are registered once, so they read the latest state from here.
  const reviewRef = useRef<Review | null>(null)
  reviewRef.current = review
  const live = useRef({ active, idx, variantIdx, dismissed })
  live.current = { active, idx, variantIdx, dismissed }
  const hooks = useRef({ activeDocId, setAiState, aiAbortRef, updateUI })
  hooks.current = { activeDocId, setAiState, aiAbortRef, updateUI }

  // Which block types the chips show for what has been typed.
  const typed = (active?.rest ?? '').trim().toLowerCase()
  const cmd: Cmd = active?.cmd ?? 'generate'
  const parsed = parse(active?.rest ?? '', cmd)
  const matches = [...ITEMS[cmd], ...(cmd === 'agent' ? FILE_ITEMS : [])].filter(c => !typed || nameOf(c).includes(typed))
  const shown = matches
  // The options are listed while no complete type is on the line; after that the grey text takes over.
  const chipsVisible = !!active && !dismissed && !parsed.choice && shown.length > 0
  const navCount = shown.length
  const liveNav = useRef({ shown, navCount, chipsVisible })
  liveNav.current = { shown, navCount, chipsVisible }

  // "/agent workbook " with nothing after it yet: the fill-in sentence is shown.
  const tplKind = active && !dismissed && agentStyle === 'blanks' && cmd === 'agent' && parsed.choice?.kind && parsed.topic === null
    && !fileRequest(active.rest) && typed === nameOf(parsed.choice) ? parsed.choice.kind : null
  const liveTpl = useRef<boolean>(false)
  liveTpl.current = !!tplKind
  // Set when an option was just picked: the first blank then takes the keyboard.
  const focusBlanks = useRef(false)
  // The grey suggestion is drawn at the caret, so it is left out while text follows the caret (it would cover it).
  const ghost = active && active.atEnd && !tplKind ? ghostFor(active.rest, variantIdx, cmd) : null

  // `select`: a part of `text` to leave selected, so the next typing replaces it (the underlined class).
  const setLine = useCallback((key: string, command: Cmd, text: string, select?: [number, number]) => {
    editor.update(() => {
      const p = $getNodeByKey(key)
      if (!$isParagraphNode(p)) return
      p.clear()
      const node = $createTextNode(`/${command} ${text}`)
      p.append(node)
      if (select) {
        const base = command.length + 2
        node.select(base + select[0], base + select[1])
      } else {
        p.selectEnd()
      }
    })
  }, [editor])

  // Which paragraph the caret is on, and whether it is a "/generate" or "/agent" line.
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      const next = editorState.read((): Active | null => {
        if (!editor.isEditable()) return null
        const sel = $getSelection()
        if (!$isRangeSelection(sel)) return null
        const top = $getRealTopLevelAncestor(sel.anchor.getNode())
        if (!top || !$isParagraphNode(top)) return null
        // A selected part of the line (the class after Tab) still belongs to the line; a selection across blocks does not.
        if (!sel.isCollapsed() && $getRealTopLevelAncestor(sel.focus.getNode()) !== top) return null
        const m = LINE.exec(top.getTextContent())
        // "/agent /generate": the newest command wins, so a line can switch from one mode to the other.
        const sw = m && SWITCH.exec(m[2])
        if (m && sw) {
          const key = top.getKey()
          queueMicrotask(() => setLine(key, sw[1].toLowerCase() as Cmd, sw[2] ?? ''))
          return null
        }
        if (!m) return null
        const anchor = sel.anchor
        const text = top.getTextContent()
        // Offset of the caret from the start of the line, then compared with the line's length.
        let before = 0
        for (const child of top.getAllTextNodes()) {
          if (child.is(anchor.getNode())) { before += anchor.offset; break }
          before += child.getTextContentSize()
        }
        return { key: top.getKey(), rest: m[2], cmd: m[1].toLowerCase() as Cmd, atEnd: sel.isCollapsed() && before >= text.length }
      })
      // Focus moved into the fill-in blanks: the line is still the one being worked on.
      if (!next && document.activeElement?.closest('.gl-tpl')) return
      setActive(prev => (prev?.key === next?.key && prev?.rest === next?.rest && prev?.cmd === next?.cmd && prev?.atEnd === next?.atEnd ? prev : next))
    })
  }, [editor, setLine])

  // Typing resets the highlight and brings a dismissed panel back.
  useEffect(() => { setIdx(0); setVariantIdx(0); setDismissed(false) }, [active?.rest, active?.key])
  // The line is marked while it is a prompt line, so the block controls leave its gutter to the mode badge.
  const activeKey = active?.key
  useEffect(() => {
    if (!activeKey) return
    const el = editor.getElementByKey(activeKey)
    el?.classList.add('gl-line')
    return () => { el?.classList.remove('gl-line') }
  }, [activeKey, editor])
  // Keep the highlighted option in view when the list is long.
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    menuRef.current?.querySelector('.gl-opt.on')?.scrollIntoView({ block: 'nearest' })
  }, [idx, chipsVisible])

  // The line whose command word has already glided into the gutter (it does that once).
  const shiftedKey = useRef<string | null>(null)
  // Place the panel under the line and the grey text at the caret.
  useEffect(() => {
    if (!active) { setPos(null); shiftedKey.current = null; return }
    // A measure already queued for the previous line must not run after this effect is gone.
    let stale = false
    const measure = () => {
      if (stale) return
      const el = editor.getElementByKey(active.key)
      if (!el) { setPos(null); return }
      // "/agent " is pushed left out of the line into the gutter (see-through there) and its word is written in its place,
      // so the line itself reads from the topic on. Done first: every position below depends on it.
      const firstText = textNodes(el)[0]
      const slash = firstText ? firstText.data.indexOf('/') : -1
      const hl = commandHighlights()
      let cmdLeft = 0, cmdWidth = 0, shift = 0
      if (hl && firstText && slash >= 0) {
        const typedCmd = /^\/(generate|agent)/i.exec(firstText.data.slice(slash))
        const end = slash + (typedCmd ? typedCmd[0].length : 1 + active.cmd.length)
        const word = document.createRange()
        word.setStart(firstText, slash)
        word.setEnd(firstText, end)
        const whole = document.createRange()
        whole.setStart(firstText, slash)
        whole.setEnd(firstText, /\s/.test(firstText.data[end] ?? '') ? end + 1 : end)
        shift = whole.getBoundingClientRect().width
        el.style.textIndent = `-${shift}px`
        // The first time this line becomes a prompt line, the text glides into the gutter instead of jumping.
        if (shiftedKey.current !== active.key) {
          shiftedKey.current = active.key
          if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            el.animate([{ textIndent: '0px' }, { textIndent: `-${shift}px` }], { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
              .onfinish = () => requestAnimationFrame(measure)
          }
        }
        const b = word.getBoundingClientRect()
        if (b.width) { cmdLeft = b.left; cmdWidth = b.width; hl.set('gl-cmd', hl.make(word)) }
      } else {
        el.style.textIndent = ''
        shiftedKey.current = null
      }
      const r = el.getBoundingClientRect()
      const sel = window.getSelection()
      let cx = r.left, cy = r.top, ch = r.height
      // With the keyboard in the fill-in blanks the selection is not in the line: use the end of its text.
      const range = sel && sel.rangeCount && sel.anchorNode && el.contains(sel.anchorNode)
        ? sel.getRangeAt(0).cloneRange()
        : null
      if (range) {
        range.collapse(false)
        const rects = range.getClientRects()
        const cr = rects.length ? rects[rects.length - 1] : null
        if (cr && cr.height) { cx = cr.right; cy = cr.top; ch = cr.height }
      } else {
        // The right edge of the last character (an empty collapsed range has no box to measure).
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        let last: Text | null = null
        while (walker.nextNode()) last = walker.currentNode as Text
        if (last && last.length > 0) {
          const r2 = document.createRange()
          r2.setStart(last, last.length - 1)
          r2.setEnd(last, last.length)
          const cr = r2.getBoundingClientRect()
          if (cr.height) { cx = cr.right; cy = cr.top; ch = cr.height }
        }
      }
      // Under the line; above it when the line is near the bottom of the screen.
      const below = window.innerHeight - r.bottom
      const flip = below < 240 && r.top > below
      setPos({
        left: Math.max(8, Math.min(r.left, window.innerWidth - 480)),
        ...(flip ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
        caretX: cx, caretY: cy, caretH: ch,
        lineLeft: r.left, lineTop: r.top, lineH: r.height, font: getComputedStyle(el).font, cmdLeft, cmdWidth, shift,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    // Braces matter: Lexical treats anything an update listener returns as its cleanup function.
    const off = editor.registerUpdateListener(() => { requestAnimationFrame(measure) })
    const lineEl = editor.getElementByKey(active.key)
    return () => { stale = true; if (lineEl) lineEl.style.textIndent = ''; window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); off(); commandHighlights()?.delete('gl-cmd') }
  }, [active, editor])

  // pickFile is defined further down; the list rows call it through here.
  const pickFileRef = useRef<(a: Active, item: Item) => Promise<void>>(async () => {})
  const pick = useCallback((i: number) => {
    const { shown: list } = liveNav.current
    const a = live.current.active
    if (!a) return
    const c = list[i]
    // The line stays "quiz " (or "workbook "): "for" (and "from a file" for /agent) are grey suggestions
    // to accept with Tab, not text written for the teacher.
    if (c?.fromFileOf) { void pickFileRef.current(a, c.fromFileOf); return }
    if (c) { focusBlanks.current = a.cmd === 'agent'; setLine(a.key, a.cmd, looseAgent && a.cmd === 'agent' ? `${nameOf(c)} for ` : `${nameOf(c)} `) }
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
      h.updateUI({ agent: { id: Date.now(), run: { kind: item.kind, prompt: topic, sources, anchorKey: a.key } }, activeMath: null, activeModel3d: null })
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

  pickFileRef.current = pickFile

  const submit = useCallback(() => {
    const { active: a, variantIdx: vi } = live.current
    if (!a || reading) return
    const p = parse(a.rest, a.cmd)
    if (!p.choice) return
    const fromFile = a.cmd === 'agent' ? fileRequest(a.rest) : null
    const wantsFile = fromFile ?? (ghostAt(a, vi)?.full?.endsWith(FILE_PHRASE) && !p.topic ? { choice: p.choice, from: '' } : null)
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
    const g = ghostAt(a, vi)
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
        else if (liveTpl.current) document.querySelector<HTMLInputElement>('.gl-tpl input')?.focus()
        else submit()
        return true
      }), COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(KEY_TAB_COMMAND, when(e => {
        const a = live.current.active
        if (!a) return false
        if (liveTpl.current) {
          e?.preventDefault()
          document.querySelector<HTMLInputElement>('.gl-tpl input')?.focus()
          return true
        }
        const g = ghostAt(a, live.current.variantIdx)
        if (g?.full) {
          e?.preventDefault()
          setLine(a.key, a.cmd, g.full, g.select)
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
      const g = ghostAt(a, live.current.variantIdx)
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
      {pos.cmdWidth > 0 && (
        <span className={`gl-cmd-chip ${cmd}`} style={{ left: pos.cmdLeft, top: pos.lineTop + pos.lineH / 2, font: pos.font, '--shift': `${pos.shift}px` } as React.CSSProperties} aria-hidden="true">
          <Sparkles className="gl-cmd-icon" size={17} strokeWidth={1.8} aria-hidden="true" />
          {cmd}
        </span>
      )}
      {tplKind && parsed.choice && (
        <AgentTemplate
          key={`${active.key}:${tplKind}`}
          kind={tplKind}
          pos={pos}
          autoFocus={focusBlanks.current}
          onRun={prompt => run(active, parsed.choice!, prompt)}
          onBack={() => {
            editor.update(() => { const p = $getNodeByKey(active.key); if ($isParagraphNode(p)) p.selectEnd() })
            editor.focus()
          }}
        />
      )}
      {ghost && (
        <span
          className="slash-ghost gl-ghost"
          style={{ left: pos.caretX + 2, top: pos.caretY, height: pos.caretH, lineHeight: `${pos.caretH}px` }}
          aria-hidden="true"
        >
          {ghost.blank
            ? (
              <>
                {ghost.text.slice(0, ghost.blank[0])}
                <span className="gl-ghost-blank">{ghost.text.slice(ghost.blank[0], ghost.blank[1])}</span>
                {ghost.text.slice(ghost.blank[1])}
              </>
            )
            : ghost.text}
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
              <div className="gl-menu" ref={menuRef}>
                {shown.map((c, i) => (
                  <button
                    key={c.label}
                    type="button"
                    role="option"
                    aria-selected={i === idx}
                    className={`gl-opt${i === idx ? ' on' : ''}${c.fromFileOf ? ' file' : ''}`}
                    onMouseMove={() => { if (i !== idx) setIdx(i) }}
                    onClick={() => pick(i)}
                  >
                    <span className="gl-opt-icon"><BlockIcon blockKey={rowIconKey(c.label, !!c.fromFileOf)} size={16} /></span>
                    <span className="gl-opt-text">
                      <span className="gl-opt-name">{c.label}</span>
                      {c.desc && <span className="gl-opt-desc">{c.desc}</span>}
                    </span>
                  </button>
                ))}
              </div>
              <div className="gl-keys">
                <span><kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>Enter</kbd> pick · <kbd>Esc</kbd> hide</span>
                {cmd === 'agent' && (
                  <button
                    type="button"
                    className="gl-style"
                    title="Compare the two ways of asking: blanks to fill in, or grey suggestions as you type"
                    onClick={() => setAgentStyleState(prev => { const next = prev === 'blanks' ? 'ghost' : 'blanks'; saveAgentStyle(next); return next })}
                  >
                    Style: {agentStyle === 'blanks' ? 'Blanks' : 'On the go'} ⇄
                  </button>
                )}
              </div>
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

/**
 * The fill-in sentence after "/agent workbook": blanks with grey hints that Tab moves between,
 * a last box for anything else, and an Enter button. Enter in any box runs it (the topic is needed).
 */
function AgentTemplate({ kind, pos, autoFocus, onRun, onBack }: {
  kind: AgentKind
  pos: { caretX: number; caretY: number; caretH: number; font: string }
  autoFocus: boolean
  onRun: (prompt: string) => void
  onBack: () => void
}) {
  const parts = TEMPLATES[kind]
  const blanks = parts.filter((p): p is { hint: string } => typeof p !== 'string')
  const [values, setValues] = useState<string[]>(() => blanks.map(() => ''))
  const [extra, setExtra] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const ready = values[0].trim().length > 0

  useEffect(() => {
    if (autoFocus) root.current?.querySelector('input')?.focus()
  }, [autoFocus])

  const run = () => {
    if (!ready) { root.current?.querySelector('input')?.focus(); return }
    onRun(composeAgentPrompt(kind, values, extra))
  }
  const onKey = (i: number, empty: boolean) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation() // the editor must not see these keys
    if (e.key === 'Enter') { e.preventDefault(); run() }
    else if (e.key === 'Escape') { e.preventDefault(); onBack() }
    else if (e.key === 'Backspace' && empty && i === 0) { e.preventDefault(); onBack() }
  }
  let b = -1
  return (
    <div
      ref={root}
      className="gl-tpl"
      style={{ left: pos.caretX + 6, top: pos.caretY, height: pos.caretH, font: pos.font }}
    >
      {parts.map((part, k) => {
        if (typeof part === 'string') return <span key={k} className="gl-tpl-word">{part}</span>
        const i = ++b
        return (
          <input
            key={k}
            className="gl-tpl-field"
            value={values[i]}
            placeholder={part.hint}
            size={Math.max(part.hint.length, values[i].length + 1)}
            maxLength={80}
            spellCheck={false}
            aria-label={part.hint.replace('e.g. ', 'For example ')}
            onChange={e => setValues(v => v.map((x, n) => (n === i ? e.target.value : x)))}
            onKeyDown={onKey(i, values[i] === '')}
          />
        )
      })}
      <input
        className="gl-tpl-field gl-tpl-extra"
        value={extra}
        placeholder="anything else…"
        size={Math.max(14, extra.length + 1)}
        maxLength={300}
        spellCheck={false}
        aria-label="Anything else to include"
        onChange={e => setExtra(e.target.value)}
        onKeyDown={onKey(blanks.length, false)}
      />
      {ready && (
        <button type="button" className="gl-tpl-enter" onClick={run} title="Run (Enter)" aria-label="Run">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 5v7a3 3 0 0 1-3 3H5" /><path d="m9 10-5 5 5 5" />
          </svg>
        </button>
      )}
    </div>
  )
}

function textNodes(root: HTMLElement): Text[] {
  const out: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) out.push(walker.currentNode as Text)
  return out
}

/** The browser's CSS Custom Highlight registry (Chrome, Edge, Safari, Firefox 140+); null where missing. */
function commandHighlights(): { set(name: string, h: unknown): void; delete(name: string): void; make(r: Range): unknown } | null {
  const reg = (CSS as unknown as { highlights?: { set(n: string, h: unknown): void; delete(n: string): void } }).highlights
  const Ctor = (globalThis as unknown as { Highlight?: new (r: Range) => unknown }).Highlight
  if (!reg || !Ctor) return null
  return { set: (n, h) => reg.set(n, h), delete: n => reg.delete(n), make: r => new Ctor(r) }
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
