import type { ConversationResourceCard } from '@xpert-ai/contracts'

export interface ResourceCardType {
  namespace: string
  type: string
}

export interface ResourceCardContext {
  tenantId: string
  organizationId?: string | null
  userId: string
  conversationId: string
  threadId: string
  projectId?: string | null
  /** Stop external reads when the host's observation deadline expires. */
  signal: AbortSignal
}

export interface ResourceCardReadRequest {
  /** Opaque correlation key. Echo it; never choose another message binding. */
  key: string
  card: ConversationResourceCard
  messageId: string
  executionId?: string
}

export type ResourceCardResolution = { key: string } & (
  | { status: 'resolved'; card: ConversationResourceCard }
  | { status: 'unavailable'; reason: 'forbidden' | 'not_found' }
)

/** Optional live presentation of committed resources; never starts work or changes business state. */
export interface IResourceCardProvider {
  /** Recheck resource access for the host-supplied actor and return one result per request. */
  resolveMany(
    context: ResourceCardContext,
    requests: readonly ResourceCardReadRequest[]
  ): Promise<readonly ResourceCardResolution[]>
}
