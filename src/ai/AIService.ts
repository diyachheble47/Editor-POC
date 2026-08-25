import type { AIRequest, AIStream, AIResult } from './types'

export interface AIService {
  stream(request: AIRequest): AIStream
  complete(request: AIRequest): Promise<AIResult>
  readonly name: string
}
