import { z } from 'zod/v3'
import { projectTaskDispatchInputSchema } from '@xpert-ai/contracts'
import { agentInvocationDispatchContextSchema, AgentJson } from '@xpert-ai/plugin-sdk'

const json: z.ZodType<AgentJson> = z.lazy(() =>
    z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(json)])
)

/** Persisted JSON is parsed before recovering a dispatch; no model-supplied identity fields. */
export const projectTaskDispatchIntentSchema = z
    .object({
        version: z.literal(1),
        input: projectTaskDispatchInputSchema,
        scope: z
            .object({
                tenantId: z.string().uuid(),
                organizationId: z.string().uuid(),
                userId: z.string().uuid(),
                workspaceId: z.string().uuid(),
                projectId: z.string().uuid(),
                conversationId: z.string().uuid(),
                parentExecutionId: z.string().min(1),
                callerAgentKey: z.string().min(1),
                callerXpertId: z.string().uuid().optional(),
                callerType: z.enum(['xpert', 'project_agent']).optional()
            })
            .strict()
            .transform((scope) => ({
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                userId: scope.userId,
                workspaceId: scope.workspaceId,
                projectId: scope.projectId,
                conversationId: scope.conversationId,
                parentExecutionId: scope.parentExecutionId,
                callerAgentKey: scope.callerAgentKey,
                ...(scope.callerXpertId ? { callerXpertId: scope.callerXpertId } : {}),
                ...(scope.callerType ? { callerType: scope.callerType } : {})
            })),
        request: z
            .object({
                callId: z.string().min(1),
                target: z
                    .object({
                        bindingId: z.string().uuid(),
                        provider: z.string().min(1),
                        revision: z.string().min(1),
                        reference: z.string().min(1),
                        configuration: z.record(json)
                    })
                    .strict()
                    .transform((target) => ({
                        bindingId: target.bindingId,
                        provider: target.provider,
                        revision: target.revision,
                        reference: target.reference,
                        configuration: target.configuration
                    })),
                input: z
                    .object({ prompt: z.string().min(1) })
                    .strict()
                    .transform((input) => ({ prompt: input.prompt })),
                dispatch: agentInvocationDispatchContextSchema
            })
            .strict()
            .transform((request) => ({
                callId: request.callId,
                target: request.target,
                input: request.input,
                dispatch: request.dispatch
            }))
    })
    .strict()
export type ProjectTaskDispatchIntent = z.output<typeof projectTaskDispatchIntentSchema>

export const projectTaskCallerSchema = z
    .object({
        executionId: z.string().uuid(),
        conversationId: z.string().uuid(),
        threadId: z.string().min(1).max(256),
        type: z.enum(['xpert', 'project_agent']),
        xpertId: z.string().uuid().optional(),
        agentKey: z.string().min(1).max(256),
        sourceMessageId: z.string().min(1).max(256)
    })
    .strict()
export type ProjectTaskCaller = z.output<typeof projectTaskCallerSchema>
