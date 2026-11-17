import { applyDecorators, SetMetadata } from '@nestjs/common'
import type {
  HumanDecisionInput,
  HumanDecisionResult,
  PrivateDecisionReply,
  AgentOutputPresentation,
  AgentOutputReference,
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

export interface AgentEventFollowUp {
  submitPrivateDecision?(reply: PrivateDecisionReply): Promise<HumanDecisionResult | { status: 'unrelated' }>
  wake(input: { conversationId: string; prompt: string; threadId?: string; agentKey?: string }): Promise<void>
}

/** A bound source hands off committed domain outputs and resolves them for the original recipient. */
export interface AgentOutputSource {
  submitDecision?(
    context: AgentEventContext,
    input: HumanDecisionInput,
    origin: 'workbench' | 'lark'
  ): Promise<HumanDecisionResult>
  readonly kinds: readonly { key: string; label: { en_US: string; zh_Hans: string } }[]
  /** Return due, unacknowledged references belonging to this binding and recipient, up to the requested limit. */
  listPending(context: AgentEventContext, limit: number): Promise<AgentOutputReference[]>
  /** Confirm the host's committed message ID idempotently. A different ID for the same result is a conflict. */
  acknowledge(context: AgentEventContext, ref: AgentOutputReference, messageId: string): Promise<void | 'conflict'>
  /** Keep the reference pending. A timestamp postpones this item; null isolates an immutable conflict. */
  defer(context: AgentEventContext, ref: AgentOutputReference, retryAt: string | null): Promise<void>
  /** Recheck current domain access and relevance before returning any recipient-visible content. */
  resolveForRecipient(context: AgentEventContext, ref: AgentOutputReference): Promise<AgentOutputPresentation>
}
export {
  humanDecisionInputSchema,
  humanDecisionSchema,
  type HumanDecisionInput,
  type HumanDecisionResult,
  type HumanDecision,
  type PrivateDecisionCard,
  type PrivateDecisionReply
} from '@xpert-ai/contracts'
export type { AgentOutputReference, AgentOutputPresentation } from '@xpert-ai/contracts'

export interface PluginAgentEventSource {
  readonly outputs?: AgentOutputSource
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
  /** The host binds the wake to this receipt and actor. Call only for a committed, still applicable follow-up. */
  handle(
    context: AgentEventContext,
    delivery: AgentEventDelivery,
    followUp?: AgentEventFollowUp
  ): Promise<EventDecision>
}
export * from './journal'
