import { z } from 'zod'

/** Host-created execution identity, persisted only in the server-side App snapshot. */
const executionContextSchema = z.object({
    xpertId: z.string().min(1),
    conversationId: z.string().min(1),
    executionId: z.string().min(1),
    projectId: z.string().min(1).optional()
})
export type McpAppExecutionContext = z.infer<typeof executionContextSchema>

export function readMcpAppExecutionContext(value: unknown): McpAppExecutionContext | undefined {
    const result = executionContextSchema.safeParse(value)
    return result.success ? result.data : undefined
}
