import { TAcpPermissionProfile, TAcpSessionMode, THarnessType } from '@xpert-ai/contracts'
import { AcpRuntimePromptMode } from './backends/acp-backend.types'
import { AcpRuntimeEvent } from './backends/acp-backend.types'

export type EnsureAcpSessionInput = {
  sessionId?: string
  title?: string
  targetRef?: string | null
  harnessType?: THarnessType | null
  mode?: TAcpSessionMode
  permissionProfile?: TAcpPermissionProfile
  timeoutMs?: number
  environmentId?: string | null
  parentExecutionId?: string | null
  xpertId?: string | null
  threadId?: string | null
  conversationId?: string | null
  workingDirectory?: string | null
  reuseSession?: boolean
  clientSessionId?: string | null
  metadata?: Record<string, unknown> | null
}

export type RunAcpTurnInput = {
  sessionId: string
  prompt: string
  title?: string
  promptMode?: AcpRuntimePromptMode
  parentExecutionId?: string | null
  xpertId?: string | null
  threadId?: string | null
  conversationId?: string | null
  timeoutMs?: number
  deliveryMode?: 'inline_bridge' | 'legacy_observer'
  onTurnPrepared?: (turn: {
    sessionId: string
    executionId: string
    requestId: string
    turnIndex: number
    promptMode: AcpRuntimePromptMode
  }) => Promise<void> | void
}

export type RunAcpTurnResult = {
  sessionId: string
  executionId: string
  requestId: string
  turnIndex: number
  status: 'success' | 'error' | 'canceled'
  output?: string | null
  summary?: string | null
  error?: string | null
  events: AcpRuntimeEvent[]
}
