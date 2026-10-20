import { z } from 'zod/v3'
import { projectPipelineRefSchema } from '@xpert-ai/contracts'

export const pipelineRefreshSchema = z
    .object({ providerRef: projectPipelineRefSchema, sourceKey: z.string().min(1).max(500) })
    .strict()
export type PipelineRefreshIdentity = z.output<typeof pipelineRefreshSchema>
