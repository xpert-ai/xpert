import { z } from 'zod/v3'

/** Negotiated Xpert extension. MCP cancellation acknowledgements are not exit evidence. */
export const MCP_EXECUTION_CONTROL_EXTENSION_ID = 'ai.xpert/execution-control'
export const MCP_EXECUTION_CONTROL_METHOD = 'xpert/tasks/control'
export const mcpOperationIdentitySchema = z
  .object({
    version: z.literal(1),
    operationId: z.string().uuid(),
    generation: z.string().uuid(),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    toolName: z.string().min(1).max(191)
  })
  .strict()
export type McpOperationIdentity = z.output<typeof mcpOperationIdentitySchema>
export const mcpExecutionControlRequestSchema = mcpOperationIdentitySchema
  .extend({
    serverId: z.string().uuid(),
    action: z.enum(['inspect', 'terminate'])
  })
  .strict()
export type McpExecutionControlRequest = z.output<typeof mcpExecutionControlRequestSchema>
export const mcpExecutionReceiptSchema = z
  .object({
    version: z.literal(1),
    serverId: z.string().uuid(),
    operationId: z.string().uuid(),
    generation: z.string().uuid(),
    taskId: z.string().uuid().nullable(),
    state: z.enum(['pending', 'settled', 'unknown']),
    intent: z.enum(['running', 'paused', 'terminated']),
    revision: z.number().int().nonnegative(),
    handlerExited: z.boolean(),
    descendantsSettled: z.boolean()
  })
  .strict()
export type McpExecutionReceipt = z.output<typeof mcpExecutionReceiptSchema>
export const mcpExecutionCapabilitySchema = z
  .object({
    version: z.literal(1),
    serverId: z.string().uuid()
  })
  .strict()
