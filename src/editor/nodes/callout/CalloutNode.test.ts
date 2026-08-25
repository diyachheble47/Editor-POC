import { describe, test, expect } from 'vitest'
import { createEditor, $getRoot, $getNodeByKey } from 'lexical'
import type { LexicalEditor } from 'lexical'
import {
  CalloutNode,
  $createCalloutNode,
  $isCalloutNode,
} from './CalloutNode'
import type { SerializedCalloutNode } from './CalloutNode'

// ── Helpers ───────────────────────────────────────────────────────

// Headless editor — no root element.
// setRootElement() triggers Lexical's DOM reconciler which tries to render
// React decorators outside a LexicalComposer, corrupting state in tests.
function makeEditor(): LexicalEditor {
  return createEditor({
    nodes: [CalloutNode],
    onError: (e) => { throw e },
  })
}

// discrete:true processes the update synchronously and commits to _editorState.
function update(editor: LexicalEditor, fn: () => void) {
  editor.update(fn, { discrete: true })
}

// ── Tests ─────────────────────────────────────────────────────────

describe('CalloutNode — static API', () => {
  test('getType returns "callout"', () => {
    expect(CalloutNode.getType()).toBe('callout')
  })

  test('clone preserves variant and body', () => {
    const editor = makeEditor()
    update(editor, () => {
      const original = $createCalloutNode('tip', 'Hello world')
      const cloned = CalloutNode.clone(original)
      expect(cloned.__variant).toBe('tip')
      expect(cloned.__body).toBe('Hello world')
    })
  })
})

describe('$createCalloutNode', () => {
  test('uses "info" variant and empty body by default', () => {
    const editor = makeEditor()
    update(editor, () => {
      const node = $createCalloutNode()
      expect(node.__variant).toBe('info')
      expect(node.__body).toBe('')
    })
  })

  test('accepts explicit variant and body', () => {
    const editor = makeEditor()
    update(editor, () => {
      const node = $createCalloutNode('warning', 'Be careful')
      expect(node.__variant).toBe('warning')
      expect(node.__body).toBe('Be careful')
    })
  })
})

describe('$isCalloutNode', () => {
  test('returns true for a CalloutNode', () => {
    const editor = makeEditor()
    update(editor, () => {
      expect($isCalloutNode($createCalloutNode())).toBe(true)
    })
  })

  test('returns false for null', () => {
    expect($isCalloutNode(null)).toBe(false)
  })

  test('returns false for undefined', () => {
    expect($isCalloutNode(undefined)).toBe(false)
  })
})

describe('Serialization', () => {
  test('exportJSON produces the correct shape', () => {
    const editor = makeEditor()
    update(editor, () => {
      const node = $createCalloutNode('caution', 'Watch out!')
      $getRoot().append(node)
      expect(node.exportJSON()).toMatchObject({
        type: 'callout',
        version: 1,
        variant: 'caution',
        body: 'Watch out!',
      })
    })
  })

  test('importJSON round-trips with exportJSON', () => {
    const editor = makeEditor()
    update(editor, () => {
      const original = $createCalloutNode('tip', 'Helpful tip')
      $getRoot().append(original)
      const restored = CalloutNode.importJSON(original.exportJSON())
      expect(restored.__variant).toBe('tip')
      expect(restored.__body).toBe('Helpful tip')
    })
  })

  test('importJSON handles all valid variants', () => {
    const editor = makeEditor()
    const variants: SerializedCalloutNode['variant'][] = ['info', 'tip', 'warning', 'caution']
    update(editor, () => {
      variants.forEach(v => {
        const node = CalloutNode.importJSON({ type: 'callout', version: 1, variant: v, body: '' })
        expect(node.__variant).toBe(v)
      })
    })
  })
})

// Mutations — each test is self-contained within a single update() context
// to avoid cross-update state commitment issues in headless mode.
describe('Mutations', () => {
  test('setVariant updates the node in the pending state', () => {
    const editor = makeEditor()
    update(editor, () => {
      const node = $createCalloutNode('info', 'text')
      $getRoot().append(node)
      const key = node.getKey()
      node.setVariant('warning')
      // After setVariant → getWritable(), re-fetch the writable node by key
      const written = $getNodeByKey(key) as CalloutNode
      expect(written.__variant).toBe('warning')
    })
  })

  test('setBody updates the node in the pending state', () => {
    const editor = makeEditor()
    update(editor, () => {
      const node = $createCalloutNode('tip', 'original')
      $getRoot().append(node)
      const key = node.getKey()
      node.setBody('updated content')
      const written = $getNodeByKey(key) as CalloutNode
      expect(written.__body).toBe('updated content')
    })
  })

  test('variant and body can both be changed in one update', () => {
    const editor = makeEditor()
    update(editor, () => {
      const node = $createCalloutNode('info', 'hello')
      $getRoot().append(node)
      const key = node.getKey()
      node.setVariant('caution')
      node.setBody('danger zone')
      const written = $getNodeByKey(key) as CalloutNode
      expect(written.__variant).toBe('caution')
      expect(written.__body).toBe('danger zone')
    })
  })

  test('remove() decreases root child count', () => {
    const editor = makeEditor()
    update(editor, () => {
      const root = $getRoot()
      const node = $createCalloutNode()
      root.append(node)
      const sizeBefore = root.getChildrenSize()
      node.remove()
      expect(root.getChildrenSize()).toBe(sizeBefore - 1)
    })
  })

  test('duplicate by inserting a new node with copied properties', () => {
    // User-level duplication: read properties, create a new node, insert after.
    const editor = makeEditor()
    update(editor, () => {
      const root = $getRoot()
      const original = $createCalloutNode('warning', 'original')
      root.append(original)
      const copy = $createCalloutNode(original.__variant, original.__body)
      original.insertAfter(copy)
      expect($isCalloutNode(copy)).toBe(true)
      expect(copy.__variant).toBe('warning')
      expect(copy.__body).toBe('original')
      expect(root.getChildrenSize()).toBeGreaterThanOrEqual(2)
    })
  })
})

describe('Registration API', () => {
  test('registerNode prevents duplicate entries', async () => {
    const { registerNode, getRegisteredNodes } = await import('../../nodeRegistry')
    const before = getRegisteredNodes().length
    registerNode(CalloutNode)
    registerNode(CalloutNode)
    const after = getRegisteredNodes().length
    // At most one more entry than before (may already be registered via callout/index.ts import)
    expect(after - before).toBeLessThanOrEqual(1)
  })

  test('registerBlock upserts by key — no duplicate entries', async () => {
    const { registerBlock, BLOCK_REGISTRY } = await import('../../blockRegistry')
    const countBefore = BLOCK_REGISTRY.filter(b => b.key === 'callout').length
    registerBlock({
      key: 'callout',
      label: 'Callout',
      icon: '💡',
      description: 'test',
      category: 'basic',
      status: 'available',
      keywords: [],
      insert: () => {},
      inSlash: true,
      inSidebar: true,
    })
    const countAfter = BLOCK_REGISTRY.filter(b => b.key === 'callout').length
    // Upsert — still exactly one entry, not duplicated
    expect(countAfter).toBe(countBefore)
  })
})
