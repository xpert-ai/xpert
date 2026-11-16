import { z } from 'zod/v3'
import { AiModelTypeEnum, ModelFeature, modelExecutionParametersSchema } from '@xpert-ai/contracts'
import { executionSourceContextSchema } from '../shared/execution-source.schema'

// Preserve existing imports; the shared validators do not depend on this model layer.
export {
    executionToolSchema,
    executionEnvironmentSchema,
    executionSourceSchema
} from '../shared/execution-source.schema'
export { executionJson } from '../shared/execution-json'
export { cliReceiptSchema } from '../shared/cli-execution.schema'

const id = z.string().uuid()
const name = z.string().min(1).max(500)
export const executionContextSchema = executionSourceContextSchema.extend({ billableUserId: id }).strict()
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
        parameters: modelExecutionParametersSchema.optional(),
        contextWindow: z.number().int().positive().optional(),
        outputTokenLimit: z.number().int().positive().optional(),
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
        tokenBudget: positive.optional(),
        userTokenBudget: positive.optional(),
        // Read old policies/grants without retaining their removed per-request caps.
        maxInputTokens: positive.optional(),
        maxOutputTokens: positive.optional(),
        maxConcurrentRequests: positive.max(100),
        requestsPerMinute: positive.max(10000),
        requestIdleSeconds: positive.max(86400).optional(),
        leaseSeconds: positive.max(3600),
        maxDurationSeconds: positive.max(86400)
    })
    .strict()
    .refine(
        (v) =>
            (v.tokenBudget === undefined || v.userTokenBudget === undefined || v.tokenBudget <= v.userTokenBudget) &&
            v.leaseSeconds <= v.maxDurationSeconds
    )
    .transform(({ maxInputTokens: _legacyInputLimit, maxOutputTokens: _legacyOutputLimit, ...limits }) => limits)

export const executionModelsSchema = z.array(executionModelSchema).min(1).max(128)
