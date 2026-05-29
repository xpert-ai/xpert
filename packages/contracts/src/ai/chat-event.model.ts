import type { TFollowUpConsumedEvent, TChatEventMessage } from '@xpert-ai/chatkit-types'
import type { IThreadGoal } from './thread-goal.model'

export const CHAT_EVENT_TYPE_FOLLOW_UP_CONSUMED = 'follow_up_consumed' as const
export const CHAT_EVENT_TYPE_THREAD_CONTEXT_USAGE = 'thread_context_usage' as const
export const CHAT_EVENT_TYPE_CONVERSATION_TITLE_SUMMARY = 'conversation_title_summary' as const
export const CHAT_EVENT_TYPE_THREAD_GOAL_UPDATED = 'thread_goal_updated' as const
export const CHAT_EVENT_TYPE_THREAD_GOAL_CLEARED = 'thread_goal_cleared' as const

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

export function createFollowUpConsumedEvent(event: Omit<TFollowUpConsumedEvent, 'type'>): TFollowUpConsumedEvent {
  return {
    type: CHAT_EVENT_TYPE_FOLLOW_UP_CONSUMED,
    ...event
  }
}

export type TThreadGoalUpdatedEvent = {
  type: typeof CHAT_EVENT_TYPE_THREAD_GOAL_UPDATED
  conversationId: string
  threadId: string
  goal: IThreadGoal
  updatedAt: string
}

export type TThreadGoalClearedEvent = {
  type: typeof CHAT_EVENT_TYPE_THREAD_GOAL_CLEARED
  conversationId: string
  threadId: string
  updatedAt: string
}

export function createThreadGoalUpdatedEvent(
  goal: IThreadGoal,
  updatedAt: string | Date = new Date()
): TThreadGoalUpdatedEvent {
  return {
    type: CHAT_EVENT_TYPE_THREAD_GOAL_UPDATED,
    conversationId: goal.conversationId,
    threadId: goal.threadId,
    goal,
    updatedAt: toIsoString(updatedAt)
  }
}

export function createThreadGoalClearedEvent(
  event: Omit<TThreadGoalClearedEvent, 'type' | 'updatedAt'> & { updatedAt?: string | Date }
): TThreadGoalClearedEvent {
  return {
    type: CHAT_EVENT_TYPE_THREAD_GOAL_CLEARED,
    conversationId: event.conversationId,
    threadId: event.threadId,
    updatedAt: toIsoString(event.updatedAt)
  }
}

function toIsoString(value?: string | Date) {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'string') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }
  return new Date().toISOString()
}
