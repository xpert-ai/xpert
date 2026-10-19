import { z } from 'zod/v3'

/** Admission controls for host-native LLM requests; provider-internal retries and currency are not hard quotas. */
export const projectPipelineNativeModelBudgetSchema = z
  .object({
    maxCalls: z.number().int().min(1).max(1000000),
    maxTokens: z.number().int().min(1).max(1000000000000),
    reservationTokens: z.number().int().min(1).max(1000000000)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.reservationTokens > value.maxTokens)
      context.addIssue({ code: 'custom', message: 'RESERVATION_EXCEEDS_BUDGET', path: ['reservationTokens'] })
  })

export type ProjectPipelineNativeModelBudget = z.output<typeof projectPipelineNativeModelBudgetSchema>

export const projectPipelineNativeModelBudgetStatusSchema = z
  .object({
    scope: z.literal('instance_native_llm'),
    policy: projectPipelineNativeModelBudgetSchema,
    calls: z.number().int().nonnegative().safe(),
    heldCalls: z.number().int().nonnegative().safe(),
    actualTokens: z.number().int().nonnegative().safe(),
    chargedAndReservedTokens: z.number().int().nonnegative().safe(),
    admissionBlocked: z.boolean()
  })
  .strict()
export type ProjectPipelineNativeModelBudgetStatus = z.output<typeof projectPipelineNativeModelBudgetStatusSchema>
