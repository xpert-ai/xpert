import { z } from 'zod/v3'
import { projectPipelineAssistantInputSchema } from '@xpert-ai/contracts'

export const pipelineAssistantIntentSchema = z
    .object({
        xpertId: z.string().uuid(),
        workspaceId: z.string().uuid(),
        publishedVersion: z.string().min(1).max(500),
        executionId: z.string().uuid(),
        conversationId: z.string().uuid(),
        input: projectPipelineAssistantInputSchema
    })
    .strict()
export type PipelineAssistantIntent = z.output<typeof pipelineAssistantIntentSchema>
