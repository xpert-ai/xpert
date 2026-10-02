import type { AgentInvocationScope, TaskWaitRequest } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { AgentInvocationError } from './invocation-errors'

const identity = z.string().min(1).regex(/\S/)

/** Shape validation only; task inspection still revalidates the caller's access. */
export const invocationTaskWaitSchema = z
    .object({
        callId: identity.max(1024),
        taskIds: z
            .array(z.string().uuid())
            .min(1)
            .max(32)
            .refine((ids) => new Set(ids).size === ids.length),
        mode: z.enum(['any', 'all']),
        timeoutMs: z.number().int().min(0).max(60_000).optional()
    })
    .strict()

export const invocationWaitScopeSchema = z
    .object({
        tenantId: identity,
        organizationId: identity,
        userId: identity,
        workspaceId: identity.optional(),
        projectId: identity.optional(),
        conversationId: identity.optional(),
        parentExecutionId: identity,
        callerAgentKey: identity,
        callerXpertId: identity.optional()
    })
    .strict()

/** Historical rows have no request; grouped waits must carry a complete authorized scope. */
export const persistedInvocationWaitSchema = invocationTaskWaitSchema.extend({ scope: invocationWaitScopeSchema })

export function parseInvocationTaskWait(input: unknown) {
    const parsed = invocationTaskWaitSchema.safeParse(input)
    if (!parsed.success) throw new AgentInvocationError('InvalidRequest')
    // Zod v3 infers optional fields with strictNullChecks disabled; validation above enforces the SDK contract.
    return parsed.data as TaskWaitRequest
}

export function parsePersistedInvocationWait(input: unknown) {
    const parsed = persistedInvocationWaitSchema.safeParse(input)
    if (!parsed.success) throw new AgentInvocationError('InvalidRequest')
    return parsed.data as TaskWaitRequest & { scope: AgentInvocationScope }
}

export function parseInvocationWaitScope(input: unknown) {
    const parsed = invocationWaitScopeSchema.safeParse(input)
    if (!parsed.success) throw new AgentInvocationError('InvalidScope')
    const scope = parsed.data as AgentInvocationScope
    for (const key of ['workspaceId', 'projectId', 'conversationId', 'callerXpertId'] as const) {
        if (scope[key] === undefined) delete scope[key]
    }
    return scope
}
