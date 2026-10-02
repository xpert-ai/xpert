import { z } from 'zod/v3'
import { executionLimitsSchema } from './execution-schema'

export const executionPolicySchema = z.discriminatedUnion('enabled', [
    z.object({ enabled: z.literal(false) }).strict(),
    z
        .object({
            enabled: z.literal(true),
            nativeProtocols: z
                .array(z.enum(['openai_responses', 'anthropic_messages']))
                .max(2)
                .optional(),
            chatBridgeProtocols: z
                .array(z.enum(['openai_responses', 'anthropic_messages']))
                .max(2)
                .optional(),
            gatewayBaseUrl: z
                .string()
                .url()
                .refine(
                    (v) =>
                        ['http:', 'https:'].includes(new URL(v).protocol) &&
                        !new URL(v).username &&
                        !new URL(v).password &&
                        !new URL(v).search &&
                        !new URL(v).hash
                ),
            limits: executionLimitsSchema,
            tools: z
                .array(
                    z
                        .object({
                            id: z.enum(['aider', 'opencode', 'codex', 'claude']),
                            version: z.string().regex(/^\d+\.\d+\.\d+$/),
                            executable: z.string().regex(/^\/[A-Za-z0-9_./-]+$/)
                        })
                        .strict()
                )
                .min(1)
        })
        .strict()
])

export type ExecutionPolicyInput = z.output<typeof executionPolicySchema>
