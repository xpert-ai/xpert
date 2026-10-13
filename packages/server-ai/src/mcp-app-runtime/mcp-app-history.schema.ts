import { z } from 'zod/v3'

export const mcpAppHistoryQuerySchema = z.object({ messageId: z.string().trim().min(1).max(191) }).strict()
export type McpAppHistoryQuery = z.output<typeof mcpAppHistoryQuerySchema>
