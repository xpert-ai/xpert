import type { TChatEventMessage } from '@xpert-ai/chatkit-types'

export const CHAT_EVENT_TYPE_THREAD_CONTEXT_USAGE = 'thread_context_usage' as const
export const CHAT_EVENT_TYPE_CONVERSATION_TITLE_SUMMARY = 'conversation_title_summary' as const

export type TConversationTitleSummaryEvent = TChatEventMessage & {
  id?: string
  type: typeof CHAT_EVENT_TYPE_CONVERSATION_TITLE_SUMMARY
}

export function createConversationTitleSummaryEvent(
  event: Omit<TConversationTitleSummaryEvent, 'type'>
): TConversationTitleSummaryEvent {
  return {
    type: CHAT_EVENT_TYPE_CONVERSATION_TITLE_SUMMARY,
    ...event
  }
}
