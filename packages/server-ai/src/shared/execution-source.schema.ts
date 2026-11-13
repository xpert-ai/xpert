import { z } from 'zod/v3'

// Shared source validation must not inherit model billing or credential requirements.
const id = z.string().uuid()
const name = z.string().min(1).max(500)
export const executionToolSchema = z
    .object({ id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), version: z.string().regex(/^\d+\.\d+\.\d+$/) })
    .strict()
export const executionEnvironmentSchema = z.union([
    z.object({ type: z.enum(['computer', 'sandbox']), environmentId: id, instanceId: name }).strict(),
    z.object({ type: z.literal('remote'), bindingId: id, revision: name }).strict()
])
export const executionSourceSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('cli_session'), cliSessionId: id }).strict(),
    z.object({ type: z.literal('agent_invocation'), invocationId: id, bindingId: id, bindingRevision: name }).strict(),
    z
        .object({
            type: z.literal('shell_execution'),
            executionId: id,
            shellExecutionId: id,
            parentExecutionId: id,
            generation: z.number().int().positive(),
            profileRevision: name
        })
        .strict()
])
export const executionSourceContextSchema = z
    .object({
        tenantId: id,
        runtimeOrganizationId: id,
        actorUserId: id,
        xpertId: id,
        assistantVersion: name,
        assistantName: name.optional(),
        conversationId: id,
        threadId: name.optional(),
        source: executionSourceSchema,
        environment: executionEnvironmentSchema,
        tool: executionToolSchema
    })
    .strict()
