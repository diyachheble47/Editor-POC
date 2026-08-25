import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { AIService } from './AIService'

const AIServiceContext = createContext<AIService | null>(null)

export function AIServiceProvider({
  service,
  children,
}: {
  service: AIService
  children: ReactNode
}) {
  return (
    <AIServiceContext.Provider value={service}>
      {children}
    </AIServiceContext.Provider>
  )
}

export function useAIService(): AIService {
  const service = useContext(AIServiceContext)
  if (!service) throw new Error('useAIService must be used inside AIServiceProvider')
  return service
}
