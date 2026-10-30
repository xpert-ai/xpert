import { z } from 'zod/v3'

/** Credential-free tuning snapshot. Null persists an explicit opt-out of optional provider defaults. */
export const modelExecutionParametersSchema = z
  .object({
    temperature: z.number().finite().nullable().optional(),
    top_p: z.number().finite().nullable().optional(),
    top_k: z.number().int().nonnegative().nullable().optional(),
    presence_penalty: z.number().finite().nullable().optional(),
    frequency_penalty: z.number().finite().nullable().optional(),
    repetition_penalty: z.number().finite().nullable().optional(),
    seed: z.number().int().nonnegative().nullable().optional(),
    max_tokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    enable_thinking: z.boolean().nullable().optional(),
    thinking_budget: z.number().int().nonnegative().nullable().optional(),
    reasoning_effort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).nullable().optional(),
    thinking: z.enum(['enabled', 'disabled', 'adaptive']).nullable().optional(),
    budget_tokens: z.number().int().nonnegative().nullable().optional()
  })
  .strict()

export type ModelExecutionParameters = z.output<typeof modelExecutionParametersSchema>
