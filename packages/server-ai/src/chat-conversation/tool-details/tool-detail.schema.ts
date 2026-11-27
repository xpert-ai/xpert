import { z } from 'zod/v3'

export const toolDetailReferenceSchema = z
    .object({
        conversationId: z.string().uuid(),
        executionId: z.string().uuid(),
        toolCallId: z.string().min(1).max(256),
        phase: z.enum(['input', 'output', 'error']),
        id: z.string().uuid(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/)
    })
    .strict()

export const toolDetailQuerySchema = toolDetailReferenceSchema
    .omit({ conversationId: true, id: true })
    .extend({
        offset: z.coerce
            .number()
            .int()
            .min(0)
            .max(50 * 1024 * 1024)
            .default(0)
    })
    .strict()

export const toolDetailSnapshotSchema = z
    .object({
        version: z.literal(1),
        conversationId: z.string().uuid(),
        rootExecutionId: z.string().uuid(),
        executionId: z.string().uuid(),
        toolCallId: z.string().min(1).max(256),
        phase: z.enum(['input', 'output', 'error']),
        format: z.enum(['text', 'json']),
        text: z.string()
    })
    .strict()

export type ToolDetailQuery = Required<z.output<typeof toolDetailQuerySchema>>
export type ToolDetailSnapshot = z.output<typeof toolDetailSnapshotSchema>
