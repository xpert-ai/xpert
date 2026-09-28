import type { XpertAssistantProfile, XpertExtensionViewManifest } from '@xpert-ai/contracts'
import type { BotActivity } from './assistant-list-types'

export type AssistantProfile = Omit<XpertAssistantProfile, 'indicators'> & {
  indicators: {
    skillCount: number | null
    toolCount: number | null
    subAgentCount: number | null
    conversationCount30d: number | null
  }
}
export interface ProfileConversation {
  id: string
  title: string | null
  threadId: string | null
  updatedAt: string | null
  status: BotActivity['latestConversationStatus']
}
export interface ProfileViewSession {
  sessionId: string
  entryUrl: string | null
  manifest: XpertExtensionViewManifest
}
// View-controlled payloads are intentionally unknown until validated by the authenticated host/API.
export interface ProfileViewRequest {
  sessionId: string
  operation: 'data' | 'options' | 'action' | 'command'
  query?: unknown
  actionKey?: string
  parameterKey?: string
  targetId?: string
  input?: unknown
  parameters?: unknown
  commandKey?: string
  payload?: unknown
}
