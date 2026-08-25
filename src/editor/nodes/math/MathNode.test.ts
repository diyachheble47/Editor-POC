import { describe, test, expect } from 'vitest'
import { createEditor, $getRoot, $getNodeByKey } from 'lexical'
import type { LexicalEditor } from 'lexical'
import {
  MathNode,
  $createMathNode,
  $isMathNode,
  DEFAULT_MATH_LATEX,
  DEFAULT_CHEM_LATEX,
} from './MathNode'
import type { SerializedMathNode } from './MathNode'

// ── Helpers ───────────────────────────────────────────────────────

function makeEditor(): LexicalEditor {
  return createEditor({
    nodes: [MathNode],
    onError: (e) => { throw e },
  })
}

function update(editor: LexicalEditor, fn: () => void) {
  editor.update(fn, { discrete: true })
}

// ── Tests ─────────────────────────────────────────────────────────

describe('MathNode — static API', () => {
  test('getType returns "math"', () => {
    expect(MathNode.getType()).toBe('math')
  })

  test('clone preserves latex, displayMode, and variant', () => {
    const editor = makeEditor()
    update(editor, () => {
      const original = $createMathNode('\\frac{a}{b}', false, 'chemistry')
      const cloned = MathNode.clone(original)
      expect(cloned.__latex).toBe('\\frac{a}{b}')
      expect(cloned.__displayMode).toBe(false)
      expect(cloned.__variant).toBe('chemistry')
      expect(cloned.__key).toBe(original.__key)
    })
  })
})

describe('$createMathNode', () => {
  test('uses math defaults', () => {
    const editor = makeEditor()
    update(editor, () => {
      const node = $createMathNode()
      expect(node.__latex).toBe(DEFAULT_MATH_LATEX)
      expect(node.__displayMode).toBe(true)
      expect(node.__variant).toBe('math')
    })
  })

  test('accepts explicit arguments', () => {
    const editor = makeEditor()
    update(editor, () => {
      const node = $createMathNode(DEFAULT_CHEM_LATEX, false, 'chemistry')
      expect(node.__latex).toBe(DEFAULT_CHEM_LATEX)
      expect(node.__displayMode).toBe(false)
      expect(node.__variant).toBe('chemistry')
    })
  })
})

describe('$isMathNode', () => {
  test('returns true for a MathNode', () => {
    const editor = makeEditor()
    update(editor, () => {
      expect($isMathNode($createMathNode())).toBe(true)
    })
  })

  test('returns false for null', () => {
    expect($isMathNode(null)).toBe(false)
  })

  test('returns false for undefined', () => {
    expect($isMathNode(undefined)).toBe(false)
  })
})

describe('Serialization', () => {
  test('exportJSON produces the correct shape', () => {
    const editor = makeEditor()
    update(editor, () => {
      const node = $createMathNode('E = mc^2', true, 'math')
      $getRoot().append(node)
      const json = node.exportJSON()
      expect(json).toMatchObject({
        type: 'math',
        version: 1,
        latex: 'E = mc^2',
        displayMode: true,
        variant: 'math',
      })
    })
  })

  test('importJSON round-trips with exportJSON', () => {
    const editor = makeEditor()
    update(editor, () => {
      const original = $createMathNode('\\pi r^2', true, 'math')
      $getRoot().append(original)
      const restored = MathNode.importJSON(original.exportJSON())
      expect(restored.__latex).toBe('\\pi r^2')
      expect(restored.__displayMode).toBe(true)
      expect(restored.__variant).toBe('math')
    })
  })

  test('importJSON handles both variants', () => {
    const editor = makeEditor()
    update(editor, () => {
      const variants: SerializedMathNode['variant'][] = ['math', 'chemistry']
      variants.forEach(v => {
        const node = MathNode.importJSON({ type: 'math', version: 1, latex: '', displayMode: true, variant: v })
        expect(node.__variant).toBe(v)
      })
    })
  })
})

describe('Mutations', () => {
  test('setLatex updates in pending state', () => {
    const editor = makeEditor()
    update(editor, () => {
      const node = $createMathNode('a + b', true, 'math')
      $getRoot().append(node)
      const key = node.getKey()
      node.setLatex('c + d')
      const written = $getNodeByKey(key) as MathNode
      expect(written.__latex).toBe('c + d')
    })
  })

  test('setDisplayMode updates in pending state', () => {
    const editor = makeEditor()
    update(editor, () => {
      const node = $createMathNode('x', true, 'math')
      $getRoot().append(node)
      const key = node.getKey()
      node.setDisplayMode(false)
      const written = $getNodeByKey(key) as MathNode
      expect(written.__displayMode).toBe(false)
    })
  })

  test('setVariant updates in pending state', () => {
    const editor = makeEditor()
    update(editor, () => {
      const node = $createMathNode('x', true, 'math')
      $getRoot().append(node)
      const key = node.getKey()
      node.setVariant('chemistry')
      const written = $getNodeByKey(key) as MathNode
      expect(written.__variant).toBe('chemistry')
    })
  })

  test('all three mutations can be applied in one update', () => {
    const editor = makeEditor()
    update(editor, () => {
      const node = $createMathNode('old', true, 'math')
      $getRoot().append(node)
      const key = node.getKey()
      node.setLatex('new')
      node.setDisplayMode(false)
      node.setVariant('chemistry')
      const written = $getNodeByKey(key) as MathNode
      expect(written.__latex).toBe('new')
      expect(written.__displayMode).toBe(false)
      expect(written.__variant).toBe('chemistry')
    })
  })

  test('remove() decreases root child count', () => {
    const editor = makeEditor()
    update(editor, () => {
      const root = $getRoot()
      const node = $createMathNode()
      root.append(node)
      const sizeBefore = root.getChildrenSize()
      node.remove()
      expect(root.getChildrenSize()).toBe(sizeBefore - 1)
    })
  })

  test('duplicate by inserting new node with copied props', () => {
    const editor = makeEditor()
    update(editor, () => {
      const root = $getRoot()
      const original = $createMathNode('\\pi', true, 'math')
      root.append(original)
      const copy = $createMathNode(original.__latex, original.__displayMode, original.__variant)
      original.insertAfter(copy)
      expect($isMathNode(copy)).toBe(true)
      expect(copy.__latex).toBe('\\pi')
      expect(root.getChildrenSize()).toBeGreaterThanOrEqual(2)
    })
  })
})

describe('Registration API', () => {
  test('registerNode prevents duplicate entries', async () => {
    const { registerNode, getRegisteredNodes } = await import('../../nodeRegistry')
    const before = getRegisteredNodes().length
    registerNode(MathNode)
    registerNode(MathNode)
    const after = getRegisteredNodes().length
    expect(after - before).toBeLessThanOrEqual(1)
  })

  test('registerBlock upserts math by key', async () => {
    await import('./index')  // trigger self-registration
    const { registerBlock, BLOCK_REGISTRY } = await import('../../blockRegistry')
    const countBefore = BLOCK_REGISTRY.filter(b => b.key === 'math').length
    expect(countBefore).toBeGreaterThanOrEqual(1)
    registerBlock({
      key: 'math',
      label: 'Math',
      icon: '∑',
      description: 'test',
      category: 'stem',
      status: 'available',
      keywords: [],
      insert: () => {},
      inSlash: true,
      inSidebar: true,
    })
    const countAfter = BLOCK_REGISTRY.filter(b => b.key === 'math').length
    expect(countAfter).toBe(countBefore)
  })

  test('registerBlock upserts chemistry by key', async () => {
    await import('./index')  // trigger self-registration
    const { registerBlock, BLOCK_REGISTRY } = await import('../../blockRegistry')
    const countBefore = BLOCK_REGISTRY.filter(b => b.key === 'chemistry').length
    expect(countBefore).toBeGreaterThanOrEqual(1)
    registerBlock({
      key: 'chemistry',
      label: 'Chemistry',
      icon: '⚗',
      description: 'test',
      category: 'stem',
      status: 'available',
      keywords: [],
      insert: () => {},
      inSlash: true,
      inSidebar: true,
    })
    const countAfter = BLOCK_REGISTRY.filter(b => b.key === 'chemistry').length
    expect(countAfter).toBe(countBefore)
  })
})
