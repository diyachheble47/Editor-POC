import type { AIService } from './AIService'
import type { AIRequest, AIStream, AIStreamListener, AIResult, AIBlock } from './types'
import { getCommand } from './commands'

const CANNED: Record<string, string> = {
  explain:
    'This text describes a fundamental concept in the subject matter. ' +
    'The key idea is that related elements interact in a structured way, ' +
    'producing the observed outcome through a well-defined process.',
  rewrite:
    'Here is a clearer version of the selected text. ' +
    'The main point is expressed more directly, ' +
    'with unnecessary complexity removed to improve readability.',
  summarize:
    '• The document introduces the core topic and its significance.\n' +
    '• Key concepts are defined and explained with examples.\n' +
    '• Relationships between concepts are established.\n' +
    '• Practical applications are discussed.\n' +
    '• The document concludes with a summary of main findings.',
  continue:
    'Building on the concepts introduced above, we can now explore the deeper implications. ' +
    'Understanding these relationships is crucial for mastering the subject. ' +
    'The following sections will provide additional context and examples to reinforce these ideas.',
  'generate-example':
    'Here is a concrete example that illustrates this concept:\n\n' +
    'Consider a system where inputs are processed through a defined sequence of steps. ' +
    'Each step transforms the data in a specific way, ultimately producing the expected output. ' +
    'This mirrors the theoretical description exactly.',
  'generate-quiz':
    'Q1: What is the primary purpose of this concept?\n' +
    '  A) To process information sequentially\n' +
    '  B) To store data for later retrieval\n' +
    '  C) To transform inputs into structured outputs ✓\n' +
    '  D) To transmit data between systems\n\n' +
    'Q2: Which of the following best describes the relationship?\n' +
    '  A) Linear and one-directional ✓\n' +
    '  B) Circular and self-referential\n' +
    '  C) Random and unstructured\n' +
    '  D) None of the above',
  'generate-equation':
    'Here is the LaTeX equation:\n\\[E = mc^2\\]\n' +
    'This represents the mass-energy equivalence, where E is energy, m is mass, and c is the speed of light.',
  'generate-stem':
    'STEM Content: Energy and Matter\n\n' +
    'Energy conservation is described by:\n\\[\\Delta E = Q - W\\]\n' +
    'where Q is heat added to the system and W is work done by the system.\n\n' +
    'At the molecular level, the ideal gas law relates pressure, volume, and temperature:\n' +
    '\\[PV = nRT\\]',
  custom:
    'I have analysed your document and your request. ' +
    'Based on the content provided, here is my response to your query. ' +
    'The document covers several important aspects that are worth highlighting. ' +
    'Let me know if you would like me to elaborate on any specific part.',
}

function cannedResponse(commandId: string): string {
  return CANNED[commandId] ?? CANNED.custom
}

export class MockAIService implements AIService {
  readonly name = 'MockAI'

  stream(request: AIRequest): AIStream {
    const command = getCommand(request.commandId)
    const text = cannedResponse(request.commandId)

    if (command) {
      command.buildPrompt(request.selectedText, request.documentContext, request.customPrompt)
    }

    const words = text.split(/(\s+)/)
    const listeners = new Set<AIStreamListener>()
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    const start = () => {
      let index = 0
      intervalId = setInterval(() => {
        if (cancelled || index >= words.length) {
          if (intervalId) clearInterval(intervalId)
          return
        }
        const token = words[index++]
        listeners.forEach(fn => fn(token))
      }, 40)
    }

    setTimeout(start, 0)

    return {
      subscribe(listener: AIStreamListener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      cancel() {
        cancelled = true
        if (intervalId) clearInterval(intervalId)
      },
    }
  }

  async complete(request: AIRequest): Promise<AIResult> {
    await new Promise(resolve => setTimeout(resolve, 300))
    const text = cannedResponse(request.commandId)
    const blocks = this._parseBlocks(text, request.commandId)
    return { text, blocks }
  }

  private _parseBlocks(text: string, commandId: string): AIBlock[] {
    if (commandId === 'generate-equation') {
      const match = text.match(/\\\[(.+?)\\\]/s)
      if (match) {
        return [
          { type: 'paragraph', text: text.split('\n')[0] },
          { type: 'math', latex: match[1].trim(), displayMode: true },
        ]
      }
    }

    if (commandId === 'summarize') {
      const items = text
        .split('\n')
        .filter(l => l.startsWith('•'))
        .map(l => l.replace(/^•\s*/, '').trim())
      if (items.length > 0) return [{ type: 'bullet-list', items }]
    }

    const paras = text
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(Boolean)

    return paras.map(p => ({ type: 'paragraph' as const, text: p }))
  }
}
