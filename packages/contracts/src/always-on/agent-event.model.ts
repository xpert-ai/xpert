import type { EventDecision, PluginAgentEvent } from './agent-event.schema'
import type { I18nObject, IconDefinition } from '../types'
import type { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'

export * from './agent-event.schema'

/**
 * Connects a plugin source to a published assistant under one user's workspace and project scope.
 * The host checks this binding when accepting events and again when dispatching work.
 */
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
  /** Plugin-owned identifier of the configured source, such as a repository or a procurement case. */
  sourceBindingRef: string
  /** Identifies the assistant publication used to configure the binding. */
  publishedAt: Date
  /** Configuration generation carried by events so the host can detect a changed binding. */
  revision: number
  state: 'configuring' | 'enabled' | 'paused' | 'revoked'
  nextScan: Date
  capture: boolean
  lastScanAt: Date | null
  lastError: string | null
}

/**
 * The host processes receipts in sequence for each subject within a binding. Workers claim a
 * lease on this partition so different subjects can progress independently across instances.
 */
export interface IAgentEventPartition extends IBasePerTenantAndOrganizationEntityModel {
  id: string
  tenantId: string
  organizationId: string
  binding: string
  kind: string
  subject: string
  owner: string | null
  /** Lease generation. Completion is accepted only from the owner of the current, unexpired lease. */
  fence: string
  expires: Date | null
}

/**
 * The host's durable receipt for one accepted source event. Redelivery with the same envelope
 * and sourceEventId in this binding returns this receipt. Processing attempts share its id.
 */
export interface IAgentEventInbox extends IBasePerTenantAndOrganizationEntityModel {
  id: string
  tenantId: string
  organizationId: string
  binding: string
  partition: string
  sourceEventId: string
  event: PluginAgentEvent
  /** Digest of the accepted envelope used to detect conflicting reuse of a sourceEventId. */
  fingerprint: string
  /** Host-assigned sequence that orders receipts for dispatch within a partition. */
  seq: string
  state: 'pending' | 'processing' | 'retry_wait' | 'isolated' | EventDecision['status']
  attempt: number
  due: Date
  receivedAt: Date
  conflictCount: number
  decision: EventDecision | null
  error: string | null
}

/**
 * Localized identity of an event type in the inbox. Types that should share a navigation
 * filter use the same stable category key across plugins and locales.
 */
export interface AgentEventTypeDisplay {
  label: I18nObject
  icon: IconDefinition
  category: { key: string; label: I18nObject; icon: IconDefinition }
}

/**
 * Declares an event a source can publish and handle. The host admits a new event only when
 * its type and schemaVersion match a declaration from the bound source.
 */
export interface AgentEventTypeDefinition {
  type: string
  schemaVersion: number
  display?: AgentEventTypeDisplay
}

/**
 * Details a source can show the current viewer for a receipt. The source resolves its domain
 * data at read time, so a change in access also changes which details the inbox can show.
 */
export interface AgentEventPresentation {
  /** Originating conversation and optional branch. The host checks access before offering navigation. */
  conversation?: { conversationId: string; threadId?: string }
  title: string
  fields?: { label: I18nObject; value: string }[]
  result?: { action: I18nObject; fields: { label: I18nObject; value: string }[] }
}

/** Host feature used to activate the assistant workbench inbox. */
export const EVENT_INBOX_FEATURE = 'platform.event-inbox'
/** Personal host slot for a user's inbox across assistants. */
export const USER_EVENT_INBOX_SLOT = 'user.event-inbox'
/** Built-in remote view shared by the assistant workbench and personal inbox entry points. */
export const EVENT_INBOX_VIEW_KEY = 'platform.event-inbox__inbox'
