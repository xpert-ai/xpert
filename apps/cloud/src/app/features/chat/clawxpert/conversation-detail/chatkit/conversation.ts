import type { Signal } from '@angular/core'
import type { WorkbenchAssistantConversationResolution } from '@xpert-ai/contracts'
import type { WorkbenchChatFacade } from '../../../workbench-chat/workbench-chat.facade'

export const CONVERSATION_DETAIL_RELATIONS = ['messages']

export type WorkbenchConversationChatkitScope = WorkbenchAssistantConversationResolution & {
  hostRouteKey: string
  requesterXpertId: string
}

export function getChatProjectCreateName(event: { name: string; data?: Record<string, unknown> }): string | null {
  if (event.name !== 'project.create') {
    return null
  }

  const name = event.data?.['name']
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

export function resolveConversationId(metadata?: { id?: string }) {
  const conversationId = metadata?.id
  return typeof conversationId === 'string' && conversationId.trim() ? conversationId : null
}

export function assertWorkbenchConversationHint(label: string, hint: string | undefined, canonical: string | null) {
  const normalizedHint = hint?.trim()
  if (normalizedHint && normalizedHint !== canonical) {
    throw new Error(`The requested ${label} does not match the authorized Assistant conversation.`)
  }
}

export function hasTaskSummaryRefresh(
  facade: WorkbenchChatFacade
): facade is WorkbenchChatFacade & { refreshTaskSummaries(): void } {
  return 'refreshTaskSummaries' in facade && typeof facade.refreshTaskSummaries === 'function'
}

export function getOptionalSignalValue<T extends string>(facade: WorkbenchChatFacade, key: T): string | null {
  const value = (facade as WorkbenchChatFacade & Record<T, Signal<unknown> | undefined>)[key]
  if (typeof value !== 'function') {
    return null
  }
  return getString(value()) ?? null
}

export function setWritableSignalValue<T>(signalValue: Signal<T>, value: T) {
  const setter = (signalValue as Signal<T> & { set?: (next: T) => void }).set
  if (typeof setter === 'function') {
    setter.call(signalValue, value)
  }
}

export function normalizeConversationThreadId(threadId: string | null | undefined) {
  return typeof threadId === 'string' && threadId.trim() ? threadId.trim() : null
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
