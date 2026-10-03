import { z } from 'zod/v3'
import { AiModelTypeEnum, ModelFeature } from '@xpert-ai/contracts'

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
export const executionContextSchema = z
    .object({
        tenantId: id,
        runtimeOrganizationId: id,
        actorUserId: id,
        billableUserId: id,
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
    .refine((context) => context.actorUserId === context.billableUserId)
export const executionModelSchema = z
    .object({
        id: name,
        copilotId: id,
        providerScopeId: id,
        providerOrganizationId: id.nullable(),
        provider: name,
        model: name,
        modelType: z.literal(AiModelTypeEnum.LLM),
        capabilities: z.array(z.nativeEnum(ModelFeature)),
        protocols: z
            .array(
                z.enum([
                    'openai_chat',
                    'openai_responses',
                    'anthropic_messages',
                    'openai_responses_chat',
                    'anthropic_messages_chat'
                ])
            )
            .min(1)
    })
    .strict()
const positive = z.number().int().positive().max(1_000_000_000)
export const executionLimitsSchema = z
    .object({
        tokenBudget: positive,
        userTokenBudget: positive,
        maxInputTokens: positive,
        maxOutputTokens: positive,
        maxConcurrentRequests: positive.max(100),
        requestsPerMinute: positive.max(10000),
        leaseSeconds: positive.max(3600),
        maxDurationSeconds: positive.max(86400)
    })
    .strict()
    .refine(
        (v) =>
            v.maxInputTokens + v.maxOutputTokens <= v.tokenBudget &&
            v.tokenBudget <= v.userTokenBudget &&
            v.leaseSeconds <= v.maxDurationSeconds
    )
export const cliReceiptSchema = z.object({ environmentId: id, instanceId: name, receiptId: name }).strict().nullable()

/** Parse persisted JSON once at the TypeORM boundary, then use concrete contracts throughout services. */
export function executionJson<T>(schema: z.ZodType<T>) {
    return {
        to: (value: T) => (value === undefined ? undefined : schema.parse(value)),
        from: (value: unknown) => schema.parse(value)
    }
}
export const executionModelsSchema = z.array(executionModelSchema).min(1).max(128)
