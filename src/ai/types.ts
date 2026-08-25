// ── AI Command IDs ────────────────────────────────────────────────────────────

export type AICommandId =
  | 'explain'
  | 'rewrite'
  | 'summarize'
  | 'continue'
  | 'generate-example'
  | 'generate-quiz'
  | 'generate-equation'
  | 'generate-stem'
  | 'custom'

// ── Request ───────────────────────────────────────────────────────────────────

export interface AIRequest {
  commandId: AICommandId
  selectedText: string
  documentContext: string
  customPrompt?: string
  retries?: number
}

// ── Streaming ─────────────────────────────────────────────────────────────────

export type AIStreamListener = (token: string) => void

export interface AIStream {
  subscribe: (listener: AIStreamListener) => () => void
  cancel: () => void
}

// ── Structured output blocks (inserted into Lexical) ─────────────────────────

export type AIBlockType = 'paragraph' | 'heading' | 'callout' | 'math' | 'code' | 'bullet-list'

export interface AIBlockParagraph {
  type: 'paragraph'
  text: string
}

export interface AIBlockHeading {
  type: 'heading'
  level: 1 | 2 | 3
  text: string
}

export interface AIBlockCallout {
  type: 'callout'
  variant: 'info' | 'tip' | 'warning' | 'caution'
  body: string
}

export interface AIBlockMath {
  type: 'math'
  latex: string
  displayMode: boolean
}

export interface AIBlockCode {
  type: 'code'
  language: string
  code: string
}

export interface AIBlockBulletList {
  type: 'bullet-list'
  items: string[]
}

export type AIBlock =
  | AIBlockParagraph
  | AIBlockHeading
  | AIBlockCallout
  | AIBlockMath
  | AIBlockCode
  | AIBlockBulletList

// ── Result ────────────────────────────────────────────────────────────────────

export interface AIResult {
  text: string
  blocks: AIBlock[]
}

// ── Errors ────────────────────────────────────────────────────────────────────

export type AIErrorCode = 'cancelled' | 'network' | 'rate-limit' | 'auth' | 'unknown'

export interface AIError {
  code: AIErrorCode
  message: string
  retryable: boolean
}
