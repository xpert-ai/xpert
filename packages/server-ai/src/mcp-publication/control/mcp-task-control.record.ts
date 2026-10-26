import { mcpOperationIdentitySchema } from '@xpert-ai/contracts'
import { z } from 'zod'
import { McpTask } from '../entities/mcp-task.entity'

export const mcpTaskControlRecordSchema = z
    .object({
        version: z.literal(1),
        targetId: z.string().uuid(),
        generation: z.string().uuid(),
        hostId: z.string().uuid().nullable(),
        claim: z.string().uuid().nullable(),
        phase: z.enum(['queued', 'running', 'settling', 'settled']),
        handlerExited: z.boolean(),
        published: z.boolean(),
        outcome: z.enum(['completed', 'failed']).optional(),
        operation: z
            .custom<
                ReturnType<typeof mcpOperationIdentitySchema.parse>
            >((value) => mcpOperationIdentitySchema.safeParse(value).success)
            .optional()
    })
    .strict()
export type McpTaskControlRecord = z.output<typeof mcpTaskControlRecordSchema>
export function controlledMcpTask(task: McpTask) {
    task.control = mcpTaskControlRecordSchema.parse(task.control)
    return task
}
