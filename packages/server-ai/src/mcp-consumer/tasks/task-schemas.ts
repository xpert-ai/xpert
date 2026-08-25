import { MCP_TASK_STATUSES } from '@xpert-ai/contracts'
import { z } from 'zod'

const taskStatusSchema = z.enum(MCP_TASK_STATUSES)

export const mcpTaskStartResultSchema = z
    .object({
        resultType: z.literal('task'),
        taskId: z.string().min(1),
        status: taskStatusSchema,
        statusMessage: z.string().optional(),
        createdAt: z.string(),
        lastUpdatedAt: z.string(),
        ttlMs: z.number().nonnegative().nullable(),
        pollIntervalMs: z.number().positive().optional(),
        progress: z.number().min(0).max(1).nullable().optional(),
        content: z.array(z.unknown()).optional()
    })
    .passthrough()

export const mcpTaskResultSchema = z
    .object({
        resultType: z.literal('complete'),
        taskId: z.string().min(1),
        status: taskStatusSchema,
        statusMessage: z.string().optional(),
        createdAt: z.string(),
        lastUpdatedAt: z.string(),
        ttlMs: z.number().nonnegative().nullable(),
        pollIntervalMs: z.number().positive().optional(),
        progress: z.number().min(0).max(1).nullable().optional(),
        inputRequests: z.unknown().optional(),
        result: z.unknown().optional(),
        error: z.unknown().optional()
    })
    .passthrough()

export const mcpTaskAcknowledgementSchema = z
    .object({
        resultType: z.literal('complete')
    })
    .passthrough()

export type McpConsumerTaskStart = z.infer<typeof mcpTaskStartResultSchema>
export type McpConsumerTask = z.infer<typeof mcpTaskResultSchema>
export type McpConsumerTaskAcknowledgement = z.infer<typeof mcpTaskAcknowledgementSchema>
