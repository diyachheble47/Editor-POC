import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
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

export function ghostFor(rest: string, variantIdx: number, cmd: Cmd = 'generate'): Ghost | null {
  const { choice, topic } = parse(rest, cmd)
  if (!choice) return null
  if (topic === null) return { text: /\s$/.test(rest) ? 'for ' : ' for', full: `${nameOf(choice)} for `, count: 1 }
  const variants = cmd === 'generate' ? (VARIANTS[nameOf(choice)] ?? []) : []
  const options = variants.filter(v => v.startsWith(topic.toLowerCase()) && v.length > topic.length)
  if (options.length) {
    const v = options[variantIdx % options.length]
    return { text: v.slice(topic.length), full: `${nameOf(choice)} for ${v}`, count: options.length }
  }
  return null
}

interface Active { key: string; rest: string; cmd: Cmd }

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
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; caretX: number; caretY: number; caretH: number } | null>(null)

  // Command handlers are registered once, so they read the latest state from here.
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
    if (c) setLine(a.key, a.cmd, `${nameOf(c)} for `)
  }, [setLine])

  const run = useCallback((a: Active, item: Item, topic: string) => {
    editor.update(() => {
      const p = $getNodeByKey(a.key)
      if ($isParagraphNode(p)) p.clear() // leaves an empty line: that is where the block lands
    })
    const h = hooks.current
    if (item.kind) {
      // Agent: the side panel writes the whole document and asks for Accept before anything lands.
      h.updateUI({ agent: { id: Date.now(), run: { kind: item.kind, prompt: topic } }, activeMath: null, activeModel3d: null })
      return
    }
    const choice = item.choice
    if (!choice) return
    // The empty line shows progress (see BusyLine); the side panel is left alone.
    setBusy({ key: a.key, label: choice.label, topic })
    // A line near the bottom edge would show its progress half cut off: bring it up first.
    const line = editor.getElementByKey(a.key)
    if (line && line.getBoundingClientRect().bottom > window.innerHeight - 200) line.scrollIntoView({ block: 'center', behavior: 'smooth' })
    void generateBlockAtAnchor(editor, a.key, choice, topic, { docId: h.activeDocId, setAiState: h.setAiState, aiAbortRef: h.aiAbortRef })
      .then(key => {
        setBusy(null)
        if (key) reveal(editor, key)
      })
  }, [editor])

  const submit = useCallback(() => {
    const { active: a, variantIdx: vi } = live.current
    if (!a) return
    const p = parse(a.rest, a.cmd)
    if (!p.choice) return
    const topic = (p.topic ?? '').trim()
    if (topic) { run(a, p.choice, topic); return }
    // A bare type is not enough: use the grey suggestion if there is one, otherwise ask.
    const g = ghostFor(a.rest, vi, a.cmd)
    if (g?.full) { const t = parse(g.full, a.cmd).topic?.trim(); if (t) { run(a, p.choice, t); return } }
    setLine(a.key, a.cmd, `${nameOf(p.choice)} for `)
  }, [run, setLine])

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
        if (g?.full) { e?.preventDefault(); setLine(a.key, a.cmd, g.full); return true }
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
  }, [editor, pick, submit, setLine])

  if (!active || !pos) return busy ? <BusyLine editor={editor} busy={busy} /> : null
  // Once a complete type and topic are on the line, say what Enter will do, so the line never looks dead.
  const topicNow = (parsed.topic ?? '').trim()
  const readyLabel = parsed.choice && topicNow
    ? (cmd === 'agent'
      ? `Enter to write a ${parsed.choice.label.toLowerCase()} about “${topicNow}” in the AI panel`
      : `Enter to add a ${parsed.choice.label.toLowerCase()} about “${topicNow}”`)
    : null
  const showPanel = chipsVisible || (!dismissed && readyLabel)

  return createPortal(
    <>
      {busy && <BusyLine editor={editor} busy={busy} />}
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
          {!chipsVisible && readyLabel && <div className="gl-note" role="status">{readyLabel}</div>}
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
