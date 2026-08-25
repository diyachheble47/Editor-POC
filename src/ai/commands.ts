import type { AICommandId } from './types'

export interface AICommand {
  id: AICommandId
  label: string
  icon: string
  description: string
  requiresSelection: boolean
  buildPrompt: (selectedText: string, documentContext: string, customPrompt?: string) => string
}

export const AI_COMMANDS: AICommand[] = [
  {
    id: 'explain',
    label: 'Explain selection',
    icon: '✎',
    description: 'Explain the selected text in simple terms.',
    requiresSelection: true,
    buildPrompt: (sel) =>
      `Explain the following text clearly and concisely:\n\n${sel}`,
  },
  {
    id: 'rewrite',
    label: 'Rewrite selection',
    icon: '↺',
    description: 'Rewrite the selected text to improve clarity.',
    requiresSelection: true,
    buildPrompt: (sel) =>
      `Rewrite the following text to be clearer and more concise:\n\n${sel}`,
  },
  {
    id: 'summarize',
    label: 'Summarise document',
    icon: '≡',
    description: 'Summarise the entire document.',
    requiresSelection: false,
    buildPrompt: (_, doc) =>
      `Summarise the following document in 3–5 bullet points:\n\n${doc}`,
  },
  {
    id: 'continue',
    label: 'Continue writing',
    icon: '→',
    description: 'Continue the document from where it ends.',
    requiresSelection: false,
    buildPrompt: (_, doc) =>
      `Continue writing the following document, maintaining the same style and tone:\n\n${doc}`,
  },
  {
    id: 'generate-example',
    label: 'Generate example',
    icon: '⊕',
    description: 'Generate an example for the selected concept.',
    requiresSelection: true,
    buildPrompt: (sel) =>
      `Generate a clear, concrete example that illustrates the following concept:\n\n${sel}`,
  },
  {
    id: 'generate-quiz',
    label: 'Create quiz from selection',
    icon: '❓',
    description: 'Create quiz questions from selected text.',
    requiresSelection: true,
    buildPrompt: (sel) =>
      `Create 3 multiple-choice quiz questions based on the following content. For each question include 4 options and indicate the correct answer:\n\n${sel}`,
  },
  {
    id: 'generate-equation',
    label: 'Generate equation',
    icon: '∑',
    description: 'Generate a LaTeX equation from a description.',
    requiresSelection: true,
    buildPrompt: (sel) =>
      `Convert the following mathematical or chemical description into a LaTeX equation suitable for KaTeX rendering:\n\n${sel}`,
  },
  {
    id: 'generate-stem',
    label: 'Generate STEM content',
    icon: '⚗',
    description: 'Generate STEM-focused content with equations and explanations.',
    requiresSelection: false,
    buildPrompt: (_, doc, custom) =>
      `Generate STEM educational content${custom ? ` about: ${custom}` : ''}. Include relevant equations, explanations, and examples. Context:\n\n${doc}`,
  },
  {
    id: 'custom',
    label: 'Custom prompt…',
    icon: '✦',
    description: 'Ask AI anything about the document.',
    requiresSelection: false,
    buildPrompt: (sel, doc, custom) =>
      `${custom ?? 'Help me with this document.'}\n\nSelected text:\n${sel || '(none)'}\n\nDocument:\n${doc}`,
  },
]

export function getCommand(id: AICommandId): AICommand | undefined {
  return AI_COMMANDS.find(c => c.id === id)
}
