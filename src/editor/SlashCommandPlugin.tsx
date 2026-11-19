import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  KEY_ESCAPE_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  mergeRegister,
} from 'lexical'
import { useEditorUI } from './context/EditorUIContext'
import { useDocument } from '../context/DocumentContext'
import { AgentFlyout } from './AgentFlyout'
import type { FlyoutKind } from './AgentFlyout'
import { generateBlockAtAnchor } from './ai/generateBlock'

// Block keys whose slash-menu row opens AgentFlyout beside the list instead
// of inserting anything itself — "Agent" (all three rows) and "Generate"
// (just its one row).
const FLYOUT_KEYS = new Set(['agent', 'ai-generate'])
import {
  BLOCK_REGISTRY,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  $getRealTopLevelAncestor,
  type BlockDef,
} from './blockRegistry'

const SEARCH_DEBOUNCE_MS = 200

// "/" starts a command at the start of a line or after a space/"(" and may
// contain spaces (so "/heading 1" works). It can't start with a space or
// contain another "/" — so ordinary text like "1/2" or "/usr/bin" doesn't trigger.
const SLASH_TRIGGER = /(^|\s|\()(\/([^\s/][^/\n]{0,40})?)$/
const triggerFn = (text: string) => {
  const m = SLASH_TRIGGER.exec(text)
  if (!m) return null
  return { leadOffset: m.index + m[1].length, matchingString: m[3] ?? '', replaceableString: m[2] }
}

// How well a block matches what was typed (lower is better, null = no match):
// exact label, label starts with it, a word of the label starts with it,
// label contains it, then keywords. Without this the first match in registry
// order wins — e.g. "/geometry" used to pick Graph, whose keywords mention it.
function relevance(block: BlockDef, q: string): number | null {
  const label = block.label.toLowerCase()
  if (label === q) return 0
  if (label.startsWith(q)) return 1
  if (label.split(/\s+/).some(w => w.startsWith(q))) return 2
  if (label.includes(q)) return 3
  const keywords = block.keywords ?? []
  if (keywords.some(k => k.startsWith(q))) return 4
  if (keywords.some(k => k.includes(q))) return 5
  return null
}

function searchBlocks(blocks: BlockDef[], query: string): BlockDef[] {
  const q = query.trim().toLowerCase()
  if (!q) return blocks
  return blocks
    .map((block, index) => ({ block, index, score: relevance(block, q) }))
    .filter((r): r is { block: BlockDef; index: number; score: number } => r.score !== null)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(r => r.block)
}

// With just "/" typed nothing is highlighted (arrow keys or the mouse pick an item).
// Once something is typed, the best match is highlighted so Enter takes it.
function PreselectOnQuery({ enabled, selectedIndex, resetKey, select }: {
  enabled: boolean
  selectedIndex: number | null
  resetKey: string | null
  select: (i: number) => void
}) {
  useEffect(() => {
    if (enabled && selectedIndex === null) select(0)
  }, [enabled, selectedIndex, resetKey, select])
  return null
}

// Keeps the highlighted item inside the scrolling list. Lexical's own helper
// uses scrollIntoView, which also scrolls the page and jumps by several rows
// where a new category (with its heading) starts, so it is not used here: no
// refs are given to the options. When the item is the first of a category its
// heading is kept in view too.
function KeepSelectedVisible({ menuRef, selectedIndex }: { menuRef: { current: HTMLDivElement | null }; selectedIndex: number | null }) {
  useLayoutEffect(() => {
    const menu = menuRef.current
    const item = menu?.querySelector<HTMLElement>('.slash-menu-item.selected')
    if (!menu || !item) return
    const group = item.parentElement
    const first = group?.firstElementChild === item
    const heading = first ? (group?.previousElementSibling as HTMLElement | null) : null
    const top = (heading ?? item).offsetTop
    const bottom = item.offsetTop + item.offsetHeight
    const pad = 6
    if (top - pad < menu.scrollTop) menu.scrollTop = Math.max(0, top - pad)
    else if (bottom + pad > menu.scrollTop + menu.clientHeight) menu.scrollTop = bottom + pad - menu.clientHeight
  }, [menuRef, selectedIndex])
  return null
}

class SlashOption extends MenuOption {
  block: BlockDef
  constructor(block: BlockDef) {
    super(block.key)
    this.block = block
  }
}

export function SlashCommandPlugin() {
  const [editor] = useLexicalComposerContext()
  const [queryString, setQueryString] = useState<string | null>(null)
  const queryStringRef = useRef<string | null>(null)
  const { update: updateUI } = useEditorUI()
  const { setAiState, aiAbortRef } = useDocument()
  // "AI Agent" opens a submenu beside the list. Run from there is remembered here
  // so the normal select path can remove the typed "/agent" before starting it.
  const pendingRunRef = useRef<{ kind: FlyoutKind; prompt: string } | null>(null)
  // "Generate" (same submenu, see FLYOUT_KEYS): not routed through the AI
  // Agent panel at all — see generateBlockAtAnchor for why — so it's
  // remembered separately from the three sentence rows above.
  const pendingGenerateRef = useRef<{ label: string; topic: string } | null>(null)
  const focusFlyoutRef = useRef<(() => void) | null>(null)
  // The submenu opens only when the user goes to "Agent" (hover, or arrow keys),
  // never just because it is the first item of a freshly opened menu.
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const agentHighlightedRef = useRef(false)
  const menuElRef = useRef<HTMLDivElement>(null)
  // "Type to search…" shown right after a lone "/", like a placeholder.
  const [ghost, setGhost] = useState<{ x: number; y: number; h: number; font: string } | null>(null)

  useEffect(() => { queryStringRef.current = queryString; setFlyoutOpen(false) }, [queryString])

  // Measured in a layout effect (no frame of delay): the editor has already put
  // the "/" in the DOM by the time the query arrives. Re-measured on resize/scroll.
  useLayoutEffect(() => {
    if (queryString !== '') { setGhost(null); return }
    const measure = () => {
      // A collapsed caret has no box in some cases, so measure the "/" just typed.
      const sel = window.getSelection()
      const node = sel?.anchorNode
      const off = sel?.anchorOffset ?? 0
      if (!node || node.nodeType !== Node.TEXT_NODE || off < 1) { setGhost(null); return }
      const slash = document.createRange()
      slash.setStart(node, off - 1)
      slash.setEnd(node, off)
      const rect = slash.getBoundingClientRect()
      const host = node.parentElement
      setGhost(host && rect.height ? { x: rect.right + 4, y: rect.top, h: rect.height, font: getComputedStyle(host).fontSize } : null)
    }
    measure()
    // The ghost must vanish as soon as the "/" is gone (block inserted, menu
    // dismissed, caret moved) — the query alone stays '' in those cases.
    const unregister = editor.registerUpdateListener(({ editorState }) => {
      const stillLoneSlash = editorState.read(() => {
        const sel = $getSelection()
        if (!$isRangeSelection(sel) || !sel.isCollapsed() || sel.anchor.offset < 1) return false
        const n = sel.anchor.getNode()
        return $isTextNode(n) && n.getTextContent().slice(sel.anchor.offset - 1, sel.anchor.offset) === '/'
      })
      if (!stillLoneSlash) setGhost(null)
    })
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      unregister()
    }
  }, [queryString, editor])

  // Arrow keys count as "going to" an item: run first, never swallow the key
  // (the typeahead itself moves the highlight). Right on Agent opens its submenu.
  useEffect(() => {
    const seen = () => { if (menuVisibleRef.current) setFlyoutOpen(true); return false }
    return mergeRegister(
      editor.registerCommand(KEY_ARROW_DOWN_COMMAND, seen, COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(KEY_ARROW_UP_COMMAND, seen, COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(KEY_ARROW_RIGHT_COMMAND, (e) => {
        setFlyoutOpen(true)
        if (!menuVisibleRef.current || !agentHighlightedRef.current) return false
        e?.preventDefault()
        requestAnimationFrame(() => focusFlyoutRef.current?.())
        return true
      }, COMMAND_PRIORITY_CRITICAL),
    )
  }, [editor])
  // Is the menu actually showing something? (The trigger can stay matched while
  // nothing matches the query; Escape must then leave the typed text alone.)
  const menuVisibleRef = useRef(false)

  // The list filters on a debounced copy of the query, so it waits for a pause
  // in typing instead of re-filtering on every keystroke. queryString itself
  // stays exact (the Escape handler needs its real length). An empty query
  // (just "/") applies immediately so the full menu opens without a delay.
  const [searchQuery, setSearchQuery] = useState<string | null>(null)
  const searchQueryRef = useRef<string | null>(null)
  useEffect(() => { searchQueryRef.current = searchQuery }, [searchQuery])
  useEffect(() => {
    if (!queryString) {
      setSearchQuery(queryString)
      return
    }
    const t = setTimeout(() => setSearchQuery(queryString), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [queryString])

  // On Escape while menu is open: delete the '/' + typed query so it doesn't litter the doc
  useEffect(() => {
    return editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        const q = queryStringRef.current
        if (q === null || !menuVisibleRef.current) return false
        editor.update(() => {
          const sel = $getSelection()
          if (!$isRangeSelection(sel) || !sel.isCollapsed()) return
          const charsToDelete = 1 + (q?.length ?? 0)
          for (let i = 0; i < charsToDelete; i++) {
            sel.deleteCharacter(true)
          }
        })
        return true
      },
      COMMAND_PRIORITY_HIGH,
    )
  }, [editor])

  // Blocks in menu order. With nothing typed: grouped by category, as rendered
  // below. With a query: one flat list ranked by relevance. `options` (the
  // selectable blocks, which drive keyboard navigation) and the rendered list
  // must have the same order — otherwise `options[myIdx]` in onClick points at
  // the wrong block. Custom blocks (e.g. Columns) self-register at the end of
  // BLOCK_REGISTRY, which doesn't match their category position, so the grouped
  // order can't just filter the registry in place.
  const allMatchingBlocks = useMemo(() => {
    const q = searchQuery?.trim() ?? ''
    if (q) return searchBlocks(BLOCK_REGISTRY.filter(b => b.inSlash), q)
    return CATEGORY_ORDER.flatMap(cat => BLOCK_REGISTRY.filter(b => b.category === cat && b.inSlash))
  }, [searchQuery])

  const options = useMemo(
    () => allMatchingBlocks.filter(b => b.status === 'available').map(b => new SlashOption(b)),
    [allMatchingBlocks],
  )

  const onSelectOption = useCallback(
    (
      selectedOption: SlashOption,
      _nodeToRemove: import('lexical').TextNode | null,
      closeMenu: () => void,
      matchingString: string,
    ) => {
      // The list is filtered on a debounced copy of the query. If Enter lands
      // before that catches up, the highlighted item belongs to an older query
      // (usually the full list's first item). Resolve what was actually typed.
      let block = selectedOption.block
      const typed = matchingString.trim().toLowerCase()
      if (typed !== (searchQueryRef.current ?? '').trim().toLowerCase()) {
        const fresh = searchBlocks(BLOCK_REGISTRY.filter(b => b.inSlash && b.status === 'available'), typed)
        if (typed && fresh.length === 0) { closeMenu(); return }
        block = fresh[0] ?? block
      }

      // "Agent" and "Generate" are submenus: choosing one (Enter / click) moves
      // into its first blank. Only Run from the submenu goes on to remove the
      // typed "/agent" or "/generate" and start it. They're remembered in
      // separate refs — "Agent" goes to the AI Agent panel, "Generate" is
      // handled directly right here (see generateBlockAtAnchor) — but both
      // need the same "nothing pending yet → open the flyout" fallback.
      const run = block.key === 'agent' ? pendingRunRef.current : null
      const generate = block.key === 'ai-generate' ? pendingGenerateRef.current : null
      if (FLYOUT_KEYS.has(block.key)) {
        if (!run && !generate) { setFlyoutOpen(true); requestAnimationFrame(() => focusFlyoutRef.current?.()); return }
        pendingRunRef.current = null
        pendingGenerateRef.current = null
      }

      setGhost(null)
      // Captured while removing "/generate …" below, since that's the exact
      // spot the generated block must come back to once the AI responds —
      // not wherever the selection happens to be by then.
      let generateAnchorKey: string | null = null
      // This callback already runs inside the typeahead's own editor.update, so
      // the "/query" is removed right here. Wrapping it in another editor.update
      // would only queue it until after this one finishes — and blocks that
      // insert through a command (e.g. Divider) run immediately, so they used to
      // insert first and leave the "/query" text behind.
      {
        // Remove the whole "/query" typed at the cursor. Relying on the
        // typeahead's nodeToRemove left fragments behind (e.g. a stray "/h"
        // before a heading) when the query contained a space.
        const sel = $getSelection()
        if ($isRangeSelection(sel) && sel.isCollapsed() && sel.anchor.offset > 0) {
          const node = sel.anchor.getNode()
          if ($isTextNode(node)) {
            const text = node.getTextContent()
            const slashIdx = text.lastIndexOf('/', sel.anchor.offset - 1)
            if (slashIdx !== -1) {
              const remaining = text.slice(0, slashIdx) + text.slice(sel.anchor.offset)
              if (remaining === '') {
                // Lexical drops an emptied text node, which would leave the
                // selection pointing at a removed node and make the insert
                // below fail silently. Move the cursor to its paragraph first.
                const parent = node.getParentOrThrow()
                parent.selectStart()
                node.remove()
              } else {
                node.spliceText(slashIdx, sel.anchor.offset - slashIdx, '', true)
              }
            }
          }
        }
        if (generate) {
          const sel2 = $getSelection()
          const topLevel = $isRangeSelection(sel2) ? $getRealTopLevelAncestor(sel2.anchor.getNode()) : null
          generateAnchorKey = topLevel?.getKey() ?? null
        }
        closeMenu()
      }
      if (run) {
        updateUI({ agent: { id: Date.now(), run }, activeMath: null, activeModel3d: null })
        return
      }
      if (generate) {
        if (generateAnchorKey) void generateBlockAtAnchor(editor, generateAnchorKey, generate.label, generate.topic, { setAiState, aiAbortRef })
        return
      }
      block.insert(editor)
    },
    [editor, updateUI, setAiState, aiAbortRef],
  )

  return (
    <>
    {ghost && createPortal(
      <span className="slash-ghost" style={{ left: ghost.x, top: ghost.y, height: ghost.h, lineHeight: `${ghost.h}px`, fontSize: ghost.font }} aria-hidden="true">
        Type to search…
      </span>,
      document.body,
    )}
    <LexicalTypeaheadMenuPlugin<SlashOption>
      preselectFirstItem={false}
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={triggerFn}
      options={options}
      menuRenderFn={(anchorElementRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) => {
        if (!anchorElementRef.current) return null
        if (allMatchingBlocks.length === 0) { menuVisibleRef.current = false; return null }

        menuVisibleRef.current = true

        // Category groups when nothing is typed; one flat ranked list otherwise.
        const groups = searchQuery?.trim()
          ? [{ cat: 'results', label: 'Results', blocks: allMatchingBlocks }]
          : CATEGORY_ORDER
              .map(cat => ({
                cat,
                label: CATEGORY_LABELS[cat],
                blocks: allMatchingBlocks.filter(b => b.category === cat),
              }))
              .filter(g => g.blocks.length > 0)

        if (groups.length === 0) return null

        // Track index into the `options` array (only available blocks) for keyboard highlight
        let availableIdx = 0

        const highlightedKey = options[selectedIndex ?? -1]?.block.key
        const flyoutHighlighted = Boolean(highlightedKey && FLYOUT_KEYS.has(highlightedKey))
        const flyoutOption = flyoutHighlighted ? options.find(o => o.block.key === highlightedKey) : undefined
        agentHighlightedRef.current = flyoutHighlighted
        const showFlyout = Boolean(flyoutOption) && flyoutOpen

        return createPortal(
          <div className="slash-menu-wrap">
          <PreselectOnQuery
            enabled={Boolean(searchQuery?.trim())}
            selectedIndex={selectedIndex}
            resetKey={searchQuery}
            select={setHighlightedIndex}
          />
          <KeepSelectedVisible menuRef={menuElRef} selectedIndex={selectedIndex} />
          <div className="slash-menu" ref={menuElRef}>
            {groups.map(group => (
              <div key={group.cat}>
                <div className="slash-menu-section">{group.label}</div>
                <ul className="slash-menu-list">
                  {group.blocks.map(block => {
                    if (block.status === 'available') {
                      const myIdx = availableIdx++
                      const isSelected = myIdx === selectedIndex
                      return (
                        <li
                          key={block.key}
                          className={`slash-menu-item${isSelected ? ' selected' : ''}`}
                          onMouseMove={e => {
                            // Only a real mouse move counts. A menu that appears under a resting
                            // pointer fires mouseenter without any movement.
                            if (!e.movementX && !e.movementY) return
                            if (myIdx !== selectedIndex) setHighlightedIndex(myIdx)
                            if (FLYOUT_KEYS.has(block.key)) setFlyoutOpen(true)
                          }}
                          onClick={() => {
                            const opt = options[myIdx]
                            if (opt) selectOptionAndCleanUp(opt)
                          }}
                        >
                          <span className="slash-menu-icon">{block.icon}</span>
                          <span className="slash-menu-text">
                            <span className="slash-menu-title">{block.label}</span>
                            <span className="slash-menu-description">{block.description}</span>
                          </span>
                        </li>
                      )
                    }

                    // Coming-soon: visible but not selectable
                    return (
                      <li key={block.key} className="slash-menu-item slash-menu-item-soon">
                        <span className="slash-menu-icon">{block.icon}</span>
                        <span className="slash-menu-text">
                          <span className="slash-menu-title">{block.label}</span>
                          <span className="slash-menu-description">{block.description}</span>
                        </span>
                        <span className="slash-menu-badge-soon">Soon</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
          {showFlyout && flyoutOption && (
            <AgentFlyout
              rows={highlightedKey === 'ai-generate' ? ['generate'] : undefined}
              focusRef={focusFlyoutRef}
              onBack={() => editor.focus()}
              onRun={(kind, prompt) => {
                pendingRunRef.current = { kind, prompt }
                // Focus is in a blank; bring the editor's selection back so the typed "/agent" can be removed.
                editor.focus(() => selectOptionAndCleanUp(flyoutOption))
              }}
              onGenerate={(label, topic) => {
                pendingGenerateRef.current = { label, topic }
                // Focus is in a blank; bring the editor's selection back so the typed "/generate" can be removed.
                editor.focus(() => selectOptionAndCleanUp(flyoutOption))
              }}
            />
          )}
          </div>,
          anchorElementRef.current,
        )
      }}
    />
    </>
  )
}
