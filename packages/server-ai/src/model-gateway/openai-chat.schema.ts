import { z } from 'zod/v3'
import { modelExecutionParametersSchema } from '@xpert-ai/contracts'

export const openAIReasoningEffortSchema = modelExecutionParametersSchema.shape.reasoning_effort

export const openAIThinkingSchema = z
    .object({
        type: z.enum(['enabled', 'disabled'])
    })
    .strict()
