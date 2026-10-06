import {
  agentInvocationTerminalStatusSchema,
  agentRuntimeProgressSchema,
  projectTaskExecutionReferenceSchema
} from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { agentRuntimeReplyTargetSchema, type AgentRuntimeReplyTarget } from '../runtime/dispatch'
import { defineAgentMessageType } from './message-type'

export const AGENT_RUNTIME_EVENT_MESSAGE_TYPE = defineAgentMessageType('runtime_event', 1)

const reference = {
  version: z.literal(1),
  invocationId: z.string().uuid(),
  /** Revision of the persisted observation, never a queue delivery attempt. */
  revision: z.number().int().nonnegative(),
  projectTask: projectTaskExecutionReferenceSchema.optional()
}

/** Host-produced references. Consumers reload and authorize the invocation and its pinned observation. */
export const agentRuntimeEventSchema = z.discriminatedUnion('kind', [
  z.object({ ...reference, kind: z.literal('progress'), progress: agentRuntimeProgressSchema }).strict(),
  z.object({ ...reference, kind: z.literal('result'), status: agentInvocationTerminalStatusSchema }).strict(),
  z
    .object({
      ...reference,
      kind: z.literal('input_request'),
      interactionId: z.string().trim().min(1).max(256)
    })
    .strict()
])
export type AgentRuntimeEvent = z.output<typeof agentRuntimeEventSchema>

/** Same observation always has the same HandoffMessage.id across retries and process restarts. */
export function agentRuntimeEventMessageId(
  event: Pick<AgentRuntimeEvent, 'invocationId' | 'revision' | 'kind'>
): string {
  return `runtime-${event.invocationId}-${event.kind}-${event.revision}`
}

/** Transport states are deliberately separate from Task and Invocation status. */
export const agentRuntimeDeliveryStateSchema = z.enum(['pending', 'received', 'blocked', 'failed'])
export const agentRuntimeConsumptionStateSchema = z.enum(['pending', 'processing', 'processed', 'blocked', 'failed'])
export type AgentRuntimeDeliveryState = z.output<typeof agentRuntimeDeliveryStateSchema>
export type AgentRuntimeConsumptionState = z.output<typeof agentRuntimeConsumptionStateSchema>

/** Store under a unique scoped key in the same transaction as the continuation reservation. */
export const agentRuntimeResultClaimSchema = z
  .object({
    invocationId: z.string().uuid(),
    resultRevision: z.number().int().nonnegative(),
    recipient: agentRuntimeReplyTargetSchema,
    consumer: z.discriminatedUnion('type', [
      z.object({ type: z.literal('follow_up'), executionId: z.string().uuid() }).strict(),
      z
        .object({
          type: z.literal('wait'),
          executionId: z.string().uuid(),
          callId: z.string().trim().min(1).max(1024)
        })
        .strict()
    ])
  })
  .strict()
export type AgentRuntimeResultClaim = z.output<typeof agentRuntimeResultClaimSchema>

/**
 * Wait and asynchronous reply compete for this same key, regardless of delivery revision.
 * The storage key must additionally include tenant, organization and owner from trusted scope.
 */
export function agentRuntimeResultConsumptionKey(invocationId: string, recipient: AgentRuntimeReplyTarget): string {
  return JSON.stringify([
    invocationId,
    recipient.conversationId,
    recipient.threadId,
    recipient.type === 'project_agent' ? `project:${recipient.projectId}` : recipient.xpertId,
    recipient.agentKey
  ])
}
