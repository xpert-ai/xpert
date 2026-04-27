import type { TChatEventMessage } from '@xpert-ai/chatkit-types'
import type { TAcpRuntimePhase } from './acp-session.model'

export const CHAT_EVENT_TYPE_THREAD_CONTEXT_USAGE = 'thread_context_usage' as const
export const CHAT_EVENT_TYPE_CONVERSATION_TITLE_SUMMARY = 'conversation_title_summary' as const
export const CHAT_EVENT_TYPE_FOLLOW_UP_CONSUMED = 'follow_up_consumed' as const
export const CHAT_EVENT_TYPE_ACP_CONTROL_STATE = 'acp_control_state' as const
export const CHAT_EVENT_TYPE_ACP_TURN_STARTED = 'acp_turn_started' as const
export const CHAT_EVENT_TYPE_ACP_STATUS = 'acp_status' as const
export const CHAT_EVENT_TYPE_ACP_OUTPUT = 'acp_output' as const
export const CHAT_EVENT_TYPE_ACP_TOOL = 'acp_tool' as const
export const CHAT_EVENT_TYPE_ACP_TURN_TERMINAL = 'acp_turn_terminal' as const

export type TConversationTitleSummaryEvent = TChatEventMessage & {
  id?: string
  type: typeof CHAT_EVENT_TYPE_CONVERSATION_TITLE_SUMMARY
}

export type TFollowUpConsumedEvent = TChatEventMessage & {
  type: typeof CHAT_EVENT_TYPE_FOLLOW_UP_CONSUMED
  mode: 'queue' | 'steer'
  messageIds: string[]
  clientMessageIds?: string[]
  executionId?: string | null
  visibleAt?: string | null
}

export type TAcpChatEventBase = Omit<TChatEventMessage, 'status'> & {
  id: string
  sessionId: string
  executionId?: string | null
  turnIndex?: number | null
  phase?: TAcpRuntimePhase | null
  headline: string
  requiresAttention?: boolean
  final?: boolean
}

export type TAcpControlStateEvent = TAcpChatEventBase & {
  type: typeof CHAT_EVENT_TYPE_ACP_CONTROL_STATE
  state: 'active' | 'queued' | 'waiting_input' | 'cancel_requested' | 'close_requested' | 'closed'
  message?: string | null
}

export type TAcpTurnStartedEvent = TAcpChatEventBase & {
  type: typeof CHAT_EVENT_TYPE_ACP_TURN_STARTED
  promptMode?: 'prompt' | 'steer'
}

export type TAcpStatusEvent = TAcpChatEventBase & {
  type: typeof CHAT_EVENT_TYPE_ACP_STATUS
  message?: string | null
  details?: Record<string, unknown> | null
}

export type TAcpOutputEvent = TAcpChatEventBase & {
  type: typeof CHAT_EVENT_TYPE_ACP_OUTPUT
  text: string
}

export type TAcpToolEvent = TAcpChatEventBase & {
  type: typeof CHAT_EVENT_TYPE_ACP_TOOL
  toolCallId?: string | null
  toolStatus?: string | null
  message?: string | null
  details?: Record<string, unknown> | null
}

export type TAcpTurnTerminalEvent = TAcpChatEventBase & {
  type: typeof CHAT_EVENT_TYPE_ACP_TURN_TERMINAL
  status: 'success' | 'error' | 'canceled'
  summary?: string | null
  error?: string | null
  details?: Record<string, unknown> | null
}

export type TAcpChatEvent =
  | TAcpControlStateEvent
  | TAcpTurnStartedEvent
  | TAcpStatusEvent
  | TAcpOutputEvent
  | TAcpToolEvent
  | TAcpTurnTerminalEvent

export function createConversationTitleSummaryEvent(
  event: Omit<TConversationTitleSummaryEvent, 'type'>
): TConversationTitleSummaryEvent {
  return {
    type: CHAT_EVENT_TYPE_CONVERSATION_TITLE_SUMMARY,
    ...event
  }
}

export function createFollowUpConsumedEvent(
  event: Omit<TFollowUpConsumedEvent, 'type'>
): TFollowUpConsumedEvent {
  return {
    type: CHAT_EVENT_TYPE_FOLLOW_UP_CONSUMED,
    ...event
  }
}

export function isAcpChatEvent(value: unknown): value is TAcpChatEvent {
  if (!value || typeof value !== 'object') {
    return false
  }

  const type = Reflect.get(value, 'type')
  switch (type) {
    case CHAT_EVENT_TYPE_ACP_CONTROL_STATE:
    case CHAT_EVENT_TYPE_ACP_TURN_STARTED:
    case CHAT_EVENT_TYPE_ACP_STATUS:
    case CHAT_EVENT_TYPE_ACP_OUTPUT:
    case CHAT_EVENT_TYPE_ACP_TOOL:
    case CHAT_EVENT_TYPE_ACP_TURN_TERMINAL:
      return true
    default:
      return false
  }
}
