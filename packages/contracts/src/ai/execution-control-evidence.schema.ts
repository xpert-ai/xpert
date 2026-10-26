import { z } from 'zod/v3'

const subject = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('execution'), id: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('invocation'), id: z.string().min(1) }).strict()
])
const base = { version: z.literal(1), observedAt: z.string().datetime() }

/** Host-assigned attempt identity. A new host boot or execution never inherits an old target. */
export const executionRuntimeTargetSchema = z.discriminatedUnion('kind', [
  z
    .object({
      version: z.literal(1),
      kind: z.literal('host'),
      generation: z.string().uuid(),
      hostId: z.string().uuid()
    })
    .strict(),
  z.object({ version: z.literal(1), kind: z.literal('provider'), generation: z.string().uuid() }).strict()
])
export type ExecutionRuntimeTarget = z.output<typeof executionRuntimeTargetSchema>

export function executionRuntimeTargetsEqual(
  left: ExecutionRuntimeTarget | undefined,
  right: ExecutionRuntimeTarget | undefined
): boolean {
  if (!left || !right) return left === right
  return (
    left.version === right.version &&
    left.kind === right.kind &&
    left.generation === right.generation &&
    (left.kind !== 'host' || (right.kind === 'host' && left.hostId === right.hostId))
  )
}

/** Control acknowledgements never constitute completion evidence. Missing evidence stays unknown. */
export const executionControlEvidenceSchema = z.discriminatedUnion('source', [
  z
    .object({
      ...base,
      source: z.literal('unavailable'),
      subject,
      state: z.literal('unknown'),
      reason: z.enum(['unregistered', 'unconfirmed', 'unsupported'])
    })
    .strict(),
  z
    .object({
      ...base,
      source: z.literal('platform'),
      subject,
      scope: z.literal('owned_subtree'),
      state: z.enum(['running', 'pausing', 'paused', 'terminating', 'settled']),
      desired: z.enum(['running', 'paused', 'terminated']),
      taskId: z.string().uuid(),
      rootId: z.string().uuid(),
      revision: z.number().int().positive(),
      executionId: z.string().uuid(),
      threadId: z.string().min(1)
    })
    .strict(),
  z
    .object({
      ...base,
      source: z.literal('provider'),
      subject: z.object({ kind: z.literal('invocation'), id: z.string().min(1) }).strict(),
      scope: z.literal('operation'),
      state: z.literal('settled'),
      outcome: z.enum(['succeeded', 'failed', 'cancelled']),
      sessionId: z.string().min(1),
      runId: z.string().min(1),
      receiptKey: z.string().min(1).max(500),
      target: executionRuntimeTargetSchema.optional()
    })
    .strict(),
  z
    .object({
      ...base,
      source: z.literal('host_admission'),
      subject: z.object({ kind: z.literal('invocation'), id: z.string().min(1) }).strict(),
      scope: z.literal('operation'),
      state: z.literal('settled'),
      outcome: z.enum(['failed', 'cancelled']),
      reason: z.literal('not_started')
    })
    .strict()
])

export type ExecutionControlEvidence = z.output<typeof executionControlEvidenceSchema>

export function unknownExecutionControl(
  subject: ExecutionControlEvidence['subject'],
  reason: 'unregistered' | 'unconfirmed' | 'unsupported' = 'unconfirmed'
): ExecutionControlEvidence {
  return { version: 1, source: 'unavailable', subject, state: 'unknown', reason, observedAt: new Date().toISOString() }
}
