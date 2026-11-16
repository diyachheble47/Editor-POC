import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
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

  // The list filters on a debounced copy of the query, so it waits for a pause
  // in typing instead of re-filtering on every keystroke. queryString itself
  // stays exact (the Escape handler needs its real length). An empty query
  // (just "/") applies immediately so the full menu opens without a delay.
  const [searchQuery, setSearchQuery] = useState<string | null>(null)
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
        if (q === null) return false
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

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('/', { minLength: 0 })

  // Only available blocks go into options — these drive keyboard navigation.
  // Must be ordered the same way the menu is rendered below (grouped by
  // CATEGORY_ORDER, not raw registry order) — otherwise `options[myIdx]` in
  // onClick points at the wrong block entirely. Custom blocks (e.g. Columns)
  // get pushed onto the end of BLOCK_REGISTRY when they self-register, which
  // doesn't match their displayed category position, so this can't just
  // filter the registry in place.
  const options = useMemo(() => {
    const available = CATEGORY_ORDER.flatMap(cat =>
      BLOCK_REGISTRY.filter(b => b.category === cat && b.inSlash && b.status === 'available'),
    )
    const filtered = searchQuery
      ? available.filter(b =>
          b.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.keywords?.some(k => k.includes(searchQuery.toLowerCase()))
        )
      : available
    return filtered.map(b => new SlashOption(b))
  }, [searchQuery])

  // All blocks matching query — used for rendering (includes coming-soon)
  const allMatchingBlocks = useMemo(() => {
    const all = BLOCK_REGISTRY.filter(b => b.inSlash)
    return searchQuery
      ? all.filter(b =>
          b.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.keywords?.some(k => k.includes(searchQuery.toLowerCase()))
        )
      : all
  }, [searchQuery])

  const onSelectOption = useCallback(
    (
      selectedOption: SlashOption,
      _nodeToRemove: import('lexical').TextNode | null,
      closeMenu: () => void,
    ) => {
      editor.update(() => {
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
      })
      selectedOption.block.insert(editor)
    },
    [editor],
  )

  return (
    <LexicalTypeaheadMenuPlugin<SlashOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={options}
      menuRenderFn={(anchorElementRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) => {
        if (!anchorElementRef.current) return null
        if (allMatchingBlocks.length === 0) return null

        // Build category groups from all matching blocks
        const groups = CATEGORY_ORDER
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
