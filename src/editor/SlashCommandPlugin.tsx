import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  KEY_ESCAPE_COMMAND,
  COMMAND_PRIORITY_HIGH,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
} from 'lexical'
import {
  BLOCK_REGISTRY,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
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

  useEffect(() => { queryStringRef.current = queryString }, [queryString])
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
        closeMenu()
      }
      block.insert(editor)
    },
    [editor],
  )

  return (
    <LexicalTypeaheadMenuPlugin<SlashOption>
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

        return createPortal(
          <div className="slash-menu">
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
                          onMouseEnter={() => setHighlightedIndex(myIdx)}
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
          </div>,
          anchorElementRef.current,
        )
      }}
    />
  )
}
