import { describe, test, expect, vi, afterEach } from 'vitest'
import { MockAIService } from './MockAIService'
import type { AIRequest } from './types'

vi.useFakeTimers()

function makeRequest(commandId: AIRequest['commandId'] = 'explain'): AIRequest {
  return {
    commandId,
    selectedText: 'Test selection',
    documentContext: 'Test document',
  }
}

describe('MockAIService', () => {
  const service = new MockAIService()

  afterEach(() => {
    vi.clearAllTimers()
  })

  test('name is "MockAI"', () => {
    expect(service.name).toBe('MockAI')
  })

  test('stream emits tokens', () => {
    const tokens: string[] = []
    const stream = service.stream(makeRequest('explain'))
    stream.subscribe(t => tokens.push(t))

    vi.runAllTimers()

    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens.join('')).toBeTruthy()
  })

  test('stream unsubscribe stops receiving tokens', () => {
    const tokens: string[] = []
    const stream = service.stream(makeRequest('explain'))
    const unsub = stream.subscribe(t => tokens.push(t))

    // Advance a little, then unsubscribe
    vi.advanceTimersByTime(100)
    const countAfterUnsub = tokens.length
    unsub()
    vi.runAllTimers()

    expect(tokens.length).toBe(countAfterUnsub)
  })

  test('cancel stops token emission', () => {
    const tokens: string[] = []
    const stream = service.stream(makeRequest('rewrite'))
    stream.subscribe(t => tokens.push(t))

    vi.advanceTimersByTime(100)
    const countBeforeCancel = tokens.length
    stream.cancel()
    vi.runAllTimers()

    expect(tokens.length).toBe(countBeforeCancel)
  })

  test('complete returns text and blocks', async () => {
    const promise = service.complete(makeRequest('summarize'))
    vi.runAllTimers()
    const result = await promise

    expect(result.text).toBeTruthy()
    expect(Array.isArray(result.blocks)).toBe(true)
    expect(result.blocks.length).toBeGreaterThan(0)
  })

  test('complete for summarize returns bullet-list block', async () => {
    const promise = service.complete(makeRequest('summarize'))
    vi.runAllTimers()
    const result = await promise

    const bulletBlock = result.blocks.find(b => b.type === 'bullet-list')
    expect(bulletBlock).toBeDefined()
    if (bulletBlock?.type === 'bullet-list') {
      expect(bulletBlock.items.length).toBeGreaterThan(0)
    }
  })

  test('complete for generate-equation returns math block', async () => {
    const promise = service.complete(makeRequest('generate-equation'))
    vi.runAllTimers()
    const result = await promise

    const mathBlock = result.blocks.find(b => b.type === 'math')
    expect(mathBlock).toBeDefined()
    if (mathBlock?.type === 'math') {
      expect(mathBlock.latex).toBeTruthy()
    }
  })

  test('complete for explain returns paragraph blocks', async () => {
    const promise = service.complete(makeRequest('explain'))
    vi.runAllTimers()
    const result = await promise

    expect(result.blocks.every(b => b.type === 'paragraph')).toBe(true)
  })

  test('multiple subscribers receive same tokens', () => {
    const a: string[] = []
    const b: string[] = []
    const stream = service.stream(makeRequest('continue'))
    stream.subscribe(t => a.push(t))
    stream.subscribe(t => b.push(t))

    vi.runAllTimers()

    expect(a.join('')).toBe(b.join(''))
  })
})
