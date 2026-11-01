import { z } from 'zod/v3'
import { modelExecutionParametersSchema } from '@xpert-ai/contracts'

// Null clears a persisted default; request controls must specify a concrete effort level.
export const openAIReasoningEffortSchema = modelExecutionParametersSchema.shape.reasoning_effort
    .unwrap()
    .unwrap()
    .optional()

export const openAIThinkingSchema = z
    .object({
        type: z.enum(['enabled', 'disabled'])
    })
    .strict()
