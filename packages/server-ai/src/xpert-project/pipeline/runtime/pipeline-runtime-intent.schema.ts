import { z } from 'zod/v3'
import { projectPipelineJsonSchema, projectPipelineRuntimeInputSchema } from '@xpert-ai/contracts'
import { projectPipelineInvocationScopeSchema } from '@xpert-ai/plugin-sdk'

export const pipelineRuntimeIntentSchema = z
    .object({
        scope: projectPipelineInvocationScopeSchema,
        invocationId: z.string().uuid(),
        target: z
            .object({
                bindingId: z.string().uuid(),
                provider: z.string().min(1).max(200),
                revision: z.string().min(1).max(500),
                reference: z.string().min(1).max(500),
                configuration: z.record(projectPipelineJsonSchema)
            })
            .strict(),
        input: projectPipelineRuntimeInputSchema
    })
    .strict()
export type PipelineRuntimeIntent = z.output<typeof pipelineRuntimeIntentSchema>
