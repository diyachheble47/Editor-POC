import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { BLOCK_REGISTRY, type BlockDef } from './blockRegistry'

class SlashOption extends MenuOption {
  block: BlockDef
  constructor(block: BlockDef) {
    super(block.key)
    this.block = block
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  text: 'Text',
  chemistry: 'Chemistry',
}

export function SlashCommandPlugin() {
  const [editor] = useLexicalComposerContext()
  const [queryString, setQueryString] = useState<string | null>(null)

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('/', { minLength: 0 })

  const options = useMemo(() => {
    const slashBlocks = BLOCK_REGISTRY.filter((b) => b.inSlash)
    const filtered = queryString
      ? slashBlocks.filter((b) =>
          b.label.toLowerCase().includes(queryString.toLowerCase()),
        )
      : slashBlocks
    return filtered.map((b) => new SlashOption(b))
  }, [queryString])

  const onSelectOption = useCallback(
    (
      selectedOption: SlashOption,
      nodeToRemove: import('lexical').TextNode | null,
      closeMenu: () => void,
    ) => {
      editor.update(() => {
        nodeToRemove?.remove()
        closeMenu()
      })
      selectedOption.block.insert(editor)
    },
    [editor],
  )

  // Group options by category for rendering
  function groupOptions(opts: SlashOption[]) {
    const groups: { category: string; label: string; items: SlashOption[] }[] = []
    const seen = new Set<string>()
    for (const opt of opts) {
      const cat = opt.block.category
      if (!seen.has(cat)) {
        seen.add(cat)
        groups.push({ category: cat, label: CATEGORY_LABELS[cat] ?? cat, items: [] })
      }
      groups[groups.length - 1].items.push(opt)
    }
    return groups
  }

  return (
    <LexicalTypeaheadMenuPlugin<SlashOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={options}
      menuRenderFn={(anchorElementRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) => {
        if (!anchorElementRef.current || options.length === 0) return null

        const groups = groupOptions(options)
        let globalIndex = 0

        return createPortal(
          <div className="slash-menu">
            {groups.map((group) => (
              <div key={group.category}>
                <div className="slash-menu-section">{group.label}</div>
                <ul className="slash-menu-list">
                  {group.items.map((option) => {
                    const idx = globalIndex++
                    return (
                      <li
                        key={option.key}
                        className={idx === selectedIndex ? 'slash-menu-item selected' : 'slash-menu-item'}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        onClick={() => selectOptionAndCleanUp(option)}
                      >
                        <span className="slash-menu-icon">{option.block.icon}</span>
                        <span className="slash-menu-text">
                          <span className="slash-menu-title">{option.block.label}</span>
                          <span className="slash-menu-description">{option.block.description}</span>
                        </span>
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
