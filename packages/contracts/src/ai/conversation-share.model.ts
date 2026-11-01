/** Explicit Artifact source identity for platform-owned conversation snapshots. */
export const CONVERSATION_SHARE_ARTIFACT_SOURCE = {
  pluginName: '@xpert-ai/platform',
  resourceType: 'conversation_snapshot'
} as const

/** A share contains inert text only; it never grants access to the original conversation. */
export type ConversationShareAudience = 'organization' | 'public'
export interface ConversationShareSnapshot {
  title: string
  messages: { role: 'human' | 'ai'; text: string }[]
}
export interface ConversationSharePreview {
  snapshot: ConversationShareSnapshot
  digest: string
  publicSharingEnabled: boolean
  managementUrl?: string
}
export interface ConversationShareCreate {
  threadId: string
  digest: string
  audience: ConversationShareAudience
  expiresInDays: 1 | 7 | 30
  acknowledgePublic?: boolean
}
export interface ConversationShareInfo {
  id: string
  audience: ConversationShareAudience
  createdAt: string
  expiresAt: string
  /** Owner-only URL. Absent when the share is unavailable. */
  url?: string
}
export interface ConversationShareCreated extends ConversationShareInfo {
  url: string
}
export interface SharedConversation extends ConversationShareSnapshot {
  sharedAt: string
  expiresAt: string
  audience: ConversationShareAudience
}

export interface ManagedConversationShare extends ConversationShareInfo {
  title: string
  type: 'conversation'
  status: 'active' | 'expired' | 'unavailable'
}
export interface ConversationShareListQuery {
  limit?: number
  offset?: number
  search?: string
  before?: string
}
export interface ConversationShareList {
  items: ManagedConversationShare[]
  total: number
  totalAll: number
  /** Server cutoff retained across pagination and bulk revocation. */
  asOf: string
}
export interface ConversationShareRevokeAll {
  confirmation: 'revoke-all'
  before: string
}
