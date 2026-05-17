import { getReferenceLabel } from '../references'
import type { XpertChatReference } from '../references'

export type ChatFollowUpBehavior = 'queue' | 'steer'

export type ChatFollowUpRailItem = {
  id?: string
  input?: string
  content?: string
  references?: XpertChatReference[]
  mode: ChatFollowUpBehavior
}

export function normalizeFollowUpBehavior(value: unknown): ChatFollowUpBehavior | null {
  return value === 'queue' || value === 'steer' ? value : null
}

export function readFollowUpBehaviorStorageValue(value: unknown): ChatFollowUpBehavior {
  return normalizeFollowUpBehavior(value) ?? 'queue'
}

export function getBusyComposerFollowUpMode(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>): ChatFollowUpBehavior {
  return event.metaKey || event.ctrlKey ? 'queue' : 'steer'
}

export function getPendingFollowUpText(item: ChatFollowUpRailItem, referencedContentFallback: string): string {
  const text = (item.input ?? item.content ?? '').trim()
  if (text) {
    return text
  }

  const references = item.references ?? []
  if (!references.length) {
    return referencedContentFallback
  }

  const firstReferenceLabel = getReferenceLabel(references[0])
  if (references.length === 1) {
    return firstReferenceLabel
  }

  return `${firstReferenceLabel} +${references.length - 1}`
}
