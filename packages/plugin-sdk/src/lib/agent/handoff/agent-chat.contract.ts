import { TChatOptions, TChatRequest, TChatRuntimePrincipal, TChatSourceAuditOptions } from '@xpert-ai/contracts'
import { defineAgentMessageType } from './message-type'

export const AGENT_CHAT_DISPATCH_MESSAGE_TYPE = defineAgentMessageType('chat_dispatch', 1)
export const AGENT_CHAT_DISPATCH_ERROR_STEER_TARGET_NOT_RUNNING = 'steer_target_not_running'

export interface AgentChatHandoffMessageCallbackTarget {
  transport?: 'handoff-message'
  messageType: string
  headers?: Record<string, string>
  context?: Record<string, unknown>
}

export interface AgentChatRedisPubSubCallbackTarget {
  transport: 'redis-pubsub'
  context?: Record<string, unknown>
}

export type AgentChatCallbackTarget = AgentChatHandoffMessageCallbackTarget | AgentChatRedisPubSubCallbackTarget

export type AgentChatRuntimePrincipal = TChatRuntimePrincipal

export interface AgentChatDispatchPayload extends Record<string, unknown> {
  request: TChatRequest
  options: TChatOptions &
    TChatSourceAuditOptions & {
      xpertId?: string
      isDraft?: boolean
      from?: string
      fromEndUserId?: string
      runtimePrincipal?: AgentChatRuntimePrincipal
      execution?: { id: string }
      streamPersistence?: {
        transport: 'redis-stream'
        threadId?: string | null
        runId?: string | null
      }
    }
  callback: AgentChatCallbackTarget
  executionId?: string
}

export interface AgentChatCallbackEnvelopePayload extends Record<string, unknown> {
  kind: 'stream' | 'complete' | 'error'
  sourceMessageId: string
  sequence: number
  event?: unknown
  error?: string
  errorCode?: typeof AGENT_CHAT_DISPATCH_ERROR_STEER_TARGET_NOT_RUNNING
  context?: Record<string, unknown>
}
