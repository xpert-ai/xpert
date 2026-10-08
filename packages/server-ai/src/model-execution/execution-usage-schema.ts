import { z } from 'zod/v3'
import {
    executionEnvironmentSchema,
    executionModelSchema,
    executionSourceSchema,
    executionToolSchema
} from './execution-schema'

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const amount = z.number().finite().nonnegative()
const currency = z.string().min(1).max(20)
const component = z.enum(['input', 'output', 'cache_read_input', 'cache_write_input', 'request', 'cache_storage'])
const addon = z.enum(['web_search', 'grounding'])
const ttl = z.enum(['5m', '1h'])
const pricingStatus = z.enum(['priced', 'unpriced', 'free'])
const priceRule = z
    .object({
        component,
        unit_price: amount,
        unit_size: amount.positive(),
        currency: currency.optional(),
        min_input_tokens: count.optional(),
        max_input_tokens: count.optional(),
        min_output_tokens: count.optional(),
        max_output_tokens: count.optional(),
        mode: z.string().optional(),
        region: z.string().optional(),
        service_tier: z.string().optional(),
        add_on: addon.optional(),
        cache_ttl: ttl.optional(),
        daily_time_window: z
            .object({
                time_zone: z.string(),
                start_time: z.string(),
                end_time: z.string()
            })
            .strict()
            .optional()
    })
    .strict()
const priceItem = z
    .object({
        component,
        quantity: amount,
        pricingStatus,
        unitPrice: amount.optional(),
        unit: amount.positive().optional(),
        amount: amount.optional(),
        currency: currency.optional(),
        addOn: addon.optional(),
        addOnAuthority: z.literal('request').optional(),
        cacheTtl: ttl.optional(),
        rule: priceRule.optional()
    })
    .strict()

/** A durable usage fact is validated before it can be delivered to the payer's ledger. */
export const executionUsageFactSchema = z
    .object({
        context: z
            .object({
                entry: z.enum(['cli', 'agent_runtime', 'shell']),
                environment: executionEnvironmentSchema,
                actorUserId: z.string().uuid(),
                billableUserId: z.string().uuid(),
                assistantVersion: z.string().min(1),
                conversationId: z.string().uuid(),
                source: executionSourceSchema,
                grantId: z.string().uuid(),
                callId: z.string().uuid(),
                attemptId: z.string().uuid(),
                providerRequestId: z.string().max(256).optional(),
                tool: executionToolSchema
            })
            .strict(),
        model: executionModelSchema,
        promptTokens: count,
        completionTokens: count,
        totalTokens: count.positive(),
        cacheReadInputTokens: count.optional(),
        cacheWriteInputTokens: count.optional(),
        reasoningTokens: count.optional(),
        priceAuthority: z.enum(['catalog', 'provider']).optional(),
        pricingBreakdown: z.array(priceItem).optional(),
        priceAmount: amount.optional(),
        currency: currency.optional(),
        pricingStatus
    })
    .strict()
    .refine(
        (fact) =>
            fact.totalTokens === fact.promptTokens + fact.completionTokens &&
            (fact.cacheReadInputTokens ?? 0) + (fact.cacheWriteInputTokens ?? 0) <= fact.promptTokens &&
            (fact.reasoningTokens ?? 0) <= fact.completionTokens &&
            fact.context.actorUserId === fact.context.billableUserId &&
            fact.context.entry ===
                ({ cli_session: 'cli', agent_invocation: 'agent_runtime', shell_execution: 'shell' } as const)[
                    fact.context.source.type
                ]
    )

/** Diagnostic estimate only: never accepted by the accounting fact schema. */
export const executionUsageEstimateSchema = z
    .object({
        inputTokens: count,
        outputTokens: count,
        totalTokens: count
    })
    .strict()
    .refine((usage) => usage.totalTokens === usage.inputTokens + usage.outputTokens)
