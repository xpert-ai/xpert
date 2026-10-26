import { mcpOperationAuthoritySchema } from './mcp-operation-authority'
import { McpControlError } from './mcp-control.error'
import { mcpOperationIdentitySchema, mcpExecutionReceiptSchema } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { McpRemoteOperation } from './mcp-operation.entity'
import type { McpOperationScope, McpOperationRecord } from '@xpert-ai/contracts'

export const mcpOperationScopeSchema = z
    .object({
        actor: z
            .object({
                tenantId: z.string().uuid(),
                organizationId: z.string().uuid().nullable(),
                userId: z.string().uuid().nullable()
            })
            .strict(),
        workspaceId: z.string().uuid(),
        toolsetId: z.string().uuid(),
        authority: mcpOperationAuthoritySchema.optional(),
        serverName: z.string().min(1)
    })
    .strict() as z.ZodType<McpOperationScope>
export const mcpOperationRecordSchema = z
    .object({
        version: z.literal(1),
        scope: mcpOperationScopeSchema,
        reconnectable: z.boolean(),
        connectionVersion: z.string().regex(/^[a-f0-9]{64}$/),
        identity: mcpOperationIdentitySchema,
        serverId: z.string().uuid().nullable(),
        mode: z.enum(['task', 'call']),
        phase: z.enum(['reserved', 'sending', 'observing', 'settled', 'unknown']),
        hostId: z.string().uuid(),
        claim: z.string().uuid(),
        taskId: z.string().optional(),
        receipt: mcpExecutionReceiptSchema.optional(),
        task: z
            .object({
                resultType: z.literal('complete'),
                taskId: z.string(),
                status: z.enum(['working', 'input_required', 'completed', 'cancelled', 'failed']),
                createdAt: z.string(),
                lastUpdatedAt: z.string(),
                ttlMs: z.number().nullable(),
                pollIntervalMs: z.number().optional(),
                inputRequests: z.unknown().optional(),
                result: z.unknown().optional(),
                error: z.unknown().optional()
            })
            .passthrough()
            .optional(),
        result: z.object({}).passthrough().optional(),
        callReturned: z.boolean().optional(),
        hostExited: z.boolean(),
        inputResponses: z.record(z.object({}).passthrough()),
        inputLease: z.object({ key: z.string(), owner: z.string().uuid(), expiresAt: z.number() }).strict().optional(),
        failureCount: z.number().int().nonnegative()
    })
    .strict() as z.ZodType<McpOperationRecord>
export function readMcpOperation(value: McpRemoteOperation) {
    value.record = mcpOperationRecordSchema.parse(value.record)
    if (
        value.record.identity.generation !== value.generation ||
        value.record.identity.operationId !== value.id ||
        value.record.scope.actor.tenantId !== value.tenantId ||
        value.record.scope.actor.organizationId !== value.organizationId
    )
        throw new McpControlError('scope')
    return value
}
