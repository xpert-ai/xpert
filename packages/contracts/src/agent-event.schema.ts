import { z } from 'zod/v3'

const key = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !value.includes('\u0000'))
export const agentEventRefSchema = z.object({ kind: key, key }).strict()
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

export type AgentEventRef = z.infer<typeof agentEventRefSchema>
export type PluginAgentEvent = z.infer<typeof pluginAgentEventSchema>
const reasonCode = z.string().regex(/^[a-z][a-z0-9_]{0,79}$/)
export const agentEventDecisionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('handled'), operationKey: key, resultRef: agentEventRefSchema }).strict(),
  z.object({ status: z.literal('ignored'), reasonCode }).strict(),
  z.object({ status: z.literal('blocked'), reasonCode }).strict()
])
export type EventDecision = z.infer<typeof agentEventDecisionSchema>
