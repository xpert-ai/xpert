import { z } from 'zod/v3'

/**
 * Running means accepted; actual work start requires an observation.
 * Only succeeded, failed and cancelled are terminal. Unknown must be reconciled without replay.
 */
export const agentInvocationStatusSchema = z.enum([
  'queued',
  'running',
  'waiting',
  'cancelling',
  'succeeded',
  'failed',
  'cancelled',
  'unknown'
])
export type AgentInvocationStatus = z.output<typeof agentInvocationStatusSchema>
export const agentInvocationTerminalStatusSchema = z.enum(['succeeded', 'failed', 'cancelled'])

/** Activity and reported progress are separate from business acceptance. No invented percentage. */
export const agentRuntimeProgressSchema = z
  .object({
    source: z.enum(['executor', 'host']),
    observedAt: z.string().datetime({ offset: true }),
    startedAt: z.string().datetime({ offset: true }).optional(),
    phase: z.string().trim().min(1).max(200).optional(),
    summary: z.string().max(2000).optional(),
    steps: z
      .object({
        completed: z.number().int().nonnegative(),
        total: z.number().int().positive()
      })
      .strict()
      .refine((steps) => steps.completed <= steps.total)
      .optional()
  })
  .strict()
export type AgentRuntimeProgress = z.output<typeof agentRuntimeProgressSchema>
