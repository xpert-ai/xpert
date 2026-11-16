import type { EventDecision, PluginAgentEvent } from './agent-event.schema'
import type { I18nObject, IconDefinition } from './types'
import type { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'

export * from './agent-event.schema'

export interface IAgentEventBinding extends IBasePerTenantAndOrganizationEntityModel {
  id: string
  tenantId: string
  organizationId: string
  workspaceId: string
  projectId: string | null
  xpertId: string
  userId: string
  plugin: string
  adapter: string
  sourceBindingRef: string
  publishedAt: Date
  revision: number
  state: 'configuring' | 'enabled' | 'paused' | 'revoked'
  nextScan: Date
  capture: boolean
  lastScanAt: Date | null
  lastError: string | null
}

export interface IAgentEventPartition extends IBasePerTenantAndOrganizationEntityModel {
  id: string
  tenantId: string
  organizationId: string
  binding: string
  kind: string
  subject: string
  owner: string | null
  fence: string
  expires: Date | null
}

export interface IAgentEventInbox extends IBasePerTenantAndOrganizationEntityModel {
  id: string
  tenantId: string
  organizationId: string
  binding: string
  partition: string
  sourceEventId: string
  event: PluginAgentEvent
  fingerprint: string
  seq: string
  state: 'pending' | 'processing' | 'retry_wait' | 'isolated' | EventDecision['status']
  attempt: number
  due: Date
  receivedAt: Date
  conflictCount: number
  decision: EventDecision | null
  error: string | null
}

export interface AgentEventTypeDisplay {
  label: I18nObject
  icon: IconDefinition
  category: { key: string; label: I18nObject; icon: IconDefinition }
}

export interface AgentEventTypeDefinition {
  type: string
  schemaVersion: number
  display?: AgentEventTypeDisplay
}

/** Optional domain projection. Sources recheck resource access in the bound actor scope. */
export interface AgentEventPresentation {
  /** Explicit provenance in the source domain. The host authorizes it for the viewing principal. */
  conversation?: { conversationId: string; threadId?: string }
  title: string
  fields?: { label: I18nObject; value: string }[]
  result?: { action: I18nObject; fields: { label: I18nObject; value: string }[] }
}

export const EVENT_INBOX_FEATURE = 'platform.event-inbox'
export const USER_EVENT_INBOX_SLOT = 'user.event-inbox'
export const EVENT_INBOX_VIEW_KEY = 'platform.event-inbox__inbox'
