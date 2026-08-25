import { useCallback, useRef, useState } from 'react'
import type { AIRequest, AIBlock, AIError } from './types'
import type { AIService } from './AIService'

export type AIStreamStatus = 'idle' | 'streaming' | 'done' | 'error' | 'cancelled'

export interface AIStreamState {
  status: AIStreamStatus
  text: string
  blocks: AIBlock[]
  error: AIError | null
}

export interface UseAIStreamReturn extends AIStreamState {
  start: (service: AIService, request: AIRequest) => void
  cancel: () => void
  reset: () => void
}

const INITIAL: AIStreamState = {
  status: 'idle',
  text: '',
  blocks: [],
  error: null,
}

export function useAIStream(): UseAIStreamReturn {
  const [state, setState] = useState<AIStreamState>(INITIAL)
  const cancelRef = useRef<(() => void) | null>(null)

  const cancel = useCallback(() => {
    cancelRef.current?.()
    cancelRef.current = null
    setState(prev => ({
      ...prev,
      status: 'cancelled',
      error: { code: 'cancelled', message: 'Request cancelled.', retryable: true },
    }))
  }, [])

  const reset = useCallback(() => {
    cancelRef.current?.()
    cancelRef.current = null
    setState(INITIAL)
  }, [])

  const start = useCallback((service: AIService, request: AIRequest) => {
    cancelRef.current?.()

    setState({ status: 'streaming', text: '', blocks: [], error: null })

    let accumulated = ''
    const aiStream = service.stream(request)

    const unsubscribe = aiStream.subscribe(token => {
      accumulated += token
      setState(prev => ({ ...prev, text: accumulated }))
    })

    cancelRef.current = () => {
      unsubscribe()
      aiStream.cancel()
    }

    service.complete(request)
      .then(result => {
        unsubscribe()
        cancelRef.current = null
        setState({ status: 'done', text: result.text, blocks: result.blocks, error: null })
      })
      .catch((err: unknown) => {
        unsubscribe()
        cancelRef.current = null
        const message = err instanceof Error ? err.message : 'Unknown error'
        setState(prev => ({
          ...prev,
          status: 'error',
          error: { code: 'unknown', message, retryable: true },
        }))
      })
  }, [])

  return { ...state, start, cancel, reset }
}
