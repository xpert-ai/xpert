import { z } from 'zod/v3'
import { builtinCliTools } from '@xpert-ai/cli-model-profiles'
import { executionLimitsSchema } from './execution-schema'
import { defaultExecutionGatewayUrl, defaultExecutionLimits } from './execution-policy.defaults'

const policyObjectSchema = z
    .object({
        // Accept old persisted/API values, but the former tenant switch no longer controls availability.
        enabled: z
            .boolean()
            .optional()
            .transform(() => true as const),
        nativeProtocols: z
            .array(z.enum(['openai_responses', 'anthropic_messages']))
            .max(2)
            .default(['openai_responses']),
        chatBridgeProtocols: z
            .array(z.enum(['openai_responses', 'anthropic_messages']))
            .max(2)
            .default(['openai_responses', 'anthropic_messages']),
        gatewayBaseUrl: z
            .string()
            .url()
            .refine((value) => {
                const url = new URL(value)
                return (
                    ['http:', 'https:'].includes(url.protocol) &&
                    !url.username &&
                    !url.password &&
                    !url.search &&
                    !url.hash
                )
            })
            .default(defaultExecutionGatewayUrl),
        defaultDurationSeconds: z.number().int().positive().max(86400).default(3600),
        limits: executionLimitsSchema.default(() => ({ ...defaultExecutionLimits })),
        cliPermissions: z
            .object({
                defaultMode: z.enum(['allow', 'restricted']).default('allow'),
                overrides: z
                    .record(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), z.enum(['allow', 'restricted']))
                    .default(() => ({}))
            })
            .strict()
            .default(() => ({ defaultMode: 'allow' as const, overrides: {} })),
        tools: z
            .array(
                z
                    .object({
                        id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
                        version: z.string().regex(/^\d+\.\d+\.\d+$/),
                        executable: z
                            .string()
                            .regex(/^\/[A-Za-z0-9_./-]+$/)
                            .refine((value) => !value.split('/').includes('..'))
                    })
                    .strict()
            )
            .min(1)
            .refine((tools) => new Set(tools.map((tool) => tool.id)).size === tools.length)
            .default(() => builtinCliTools.map((tool) => ({ ...tool })))
    })
    .strict()

// Legacy policies used one value for both default and ceiling. Preserve that behavior.
export const executionPolicySchema = z.preprocess((value) => {
    if (value && typeof value === 'object' && !Array.isArray(value) &&
        !('defaultDurationSeconds' in value) && 'limits' in value && value.limits &&
        typeof value.limits === 'object' && 'maxDurationSeconds' in value.limits) {
        return { ...value, defaultDurationSeconds: value.limits.maxDurationSeconds }
    }
    return value
}, policyObjectSchema.refine((value) => value.defaultDurationSeconds <= value.limits.maxDurationSeconds,
    { path: ['defaultDurationSeconds'], message: 'Default duration exceeds tenant limit' }))

export type ExecutionPolicyInput = z.output<typeof executionPolicySchema>
