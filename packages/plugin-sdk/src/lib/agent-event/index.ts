import { applyDecorators, SetMetadata } from '@nestjs/common'
import type {
  AgentEventPresentation,
  AgentEventTypeDefinition,
  EventDecision,
  PluginAgentEvent
} from '@xpert-ai/contracts'
import { STRATEGY_META_KEY } from '../types'

export const AGENT_EVENT_SOURCE = 'XPERT_AGENT_EVENT_SOURCE_V1'
export const AgentEventSourceStrategy = (key: string) =>
  applyDecorators(SetMetadata(AGENT_EVENT_SOURCE, key), SetMetadata(STRATEGY_META_KEY, AGENT_EVENT_SOURCE))

export {
  agentEventRefSchema,
  pluginAgentEventSchema,
  agentEventDecisionSchema,
  type AgentEventPresentation,
  type AgentEventTypeDefinition,
  type AgentEventTypeDisplay,
  type AgentEventRef,
  type PluginAgentEvent,
  type EventDecision
} from '@xpert-ai/contracts'

export type EventPublishResult =
  | { status: 'accepted' | 'duplicate'; receiptId: string }
  | { status: 'rejected'; code: 'binding_changed' | 'invalid_event' | 'unsupported_version' | 'identity_conflict' }

export interface AgentEventPublisher {
  publish(event: PluginAgentEvent): Promise<EventPublishResult>
}

export interface AgentEventContext {
  readonly bindingId: string
  readonly bindingRevision: number
  readonly sourceBindingRef: string
  readonly tenantId: string
  readonly organizationId: string
  readonly workspaceId: string
  readonly projectId?: string
  readonly xpertId: string
  readonly userId: string
  readonly signal: AbortSignal
}

export interface AgentEventDelivery {
  receiptId: string
  fence: string
  event: PluginAgentEvent
}

export interface PluginAgentEventSource {
  readonly key: string
  readonly protocolVersion: 1
  readonly eventTypes: readonly AgentEventTypeDefinition[]
  /** Authorized title matches within this binding. The host intersects these with its visible receipts. */
  searchTitles?(
    context: AgentEventContext,
    term: string
  ): Promise<({ subject: string } | { result: { kind: string; key: string } })[]>
  describe?(
    context: AgentEventContext,
    event: PluginAgentEvent,
    decision: EventDecision | null,
    options?: { includeConversation: boolean }
  ): Promise<AgentEventPresentation | null>
  /** Changes the capture policy only for an authorized source and revision. */
  configure(context: AgentEventContext, enabled: boolean): Promise<void>
  drain(context: AgentEventContext, publisher: AgentEventPublisher, limit: number): Promise<{ more: boolean }>
  handle(context: AgentEventContext, delivery: AgentEventDelivery): Promise<EventDecision>
}
export * from './journal'
