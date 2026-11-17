import { z } from 'zod/v3'

const key = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !value.includes('\u0000'))
/** Validates the source-defined object identity carried in a subject or a handling result. */
export const agentEventRefSchema = z.object({ kind: key, key }).strict()
/** Validates the event envelope at inbox admission. The source retains the referenced business data. */
export const pluginAgentEventSchema = z
  .object({
    sourceEventId: key,
    bindingRevision: z.number().int().positive(),
    type: key,
    schemaVersion: z.number().int().positive(),
    occurredAt: z.string().datetime({ offset: true }),
    subject: agentEventRefSchema,
    fact: z.object({ key, revision: key, sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict()
  })
  .strict()

/**
 * An object in the source domain. The subject's kind and key determine which events are
 * ordered together. A result reference uses the same shape to identify an outcome.
 */
export type AgentEventRef = z.infer<typeof agentEventRefSchema>
/**
 * One occurrence reported under a source binding. Retrying it reuses the entire envelope.
 * bindingRevision identifies the source configuration, schemaVersion identifies the event format,
 * and fact identifies the immutable business snapshot by key, revision and content digest.
 */
export type PluginAgentEvent = z.infer<typeof pluginAgentEventSchema>
const reasonCode = z.string().regex(/^[a-z][a-z0-9_]{0,79}$/)
/** Accepts a completed source handler outcome for storage on the inbox receipt. */
export const agentEventDecisionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('handled'), operationKey: key, resultRef: agentEventRefSchema }).strict(),
  z.object({ status: z.literal('ignored'), reasonCode }).strict(),
  z.object({ status: z.literal('blocked'), reasonCode }).strict()
])
/**
 * The source handler's disposition of one receipt.
 *
 * - `handled` — Identifies the business operation and its result. Several receipts can resolve to the same operation.
 * - `ignored` — No action applies to this event. The handler supplies a stable reason code.
 * - `blocked` — The handler could not proceed. The reason code identifies what prevented it.
 */
export type EventDecision = z.infer<typeof agentEventDecisionSchema>
