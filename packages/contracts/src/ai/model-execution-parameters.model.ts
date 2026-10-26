import { z } from 'zod/v3'

/** Credential-free tuning snapshot. Output aliases are canonicalized to max_tokens at issuance. */
export const modelExecutionParametersSchema = z
  .object({
    temperature: z.number().finite().optional(),
    top_p: z.number().finite().optional(),
    top_k: z.number().int().nonnegative().optional(),
    presence_penalty: z.number().finite().optional(),
    frequency_penalty: z.number().finite().optional(),
    repetition_penalty: z.number().finite().optional(),
    seed: z.number().int().nonnegative().optional(),
    max_tokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    enable_thinking: z.boolean().optional(),
    thinking_budget: z.number().int().nonnegative().optional(),
    reasoning_effort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
    thinking: z.enum(['enabled', 'disabled', 'adaptive']).optional(),
    budget_tokens: z.number().int().nonnegative().optional()
  })
  .strict()

export type ModelExecutionParameters = z.output<typeof modelExecutionParametersSchema>
