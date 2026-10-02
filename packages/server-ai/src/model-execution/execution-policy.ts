import { z } from 'zod/v3'
import { MODEL_EXECUTION_POLICY_SETTING, ModelExecutionPolicy } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TenantSetting } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { executionError } from './execution-errors'

import { executionLimitsSchema } from './execution-schema'
export { executionLimitsSchema } from './execution-schema'

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

export function parseExecutionPolicy(value: unknown): ModelExecutionPolicy {
    if (value === undefined || value === null || value === '') return { enabled: false }
    try {
        return executionPolicySchema.parse(
            typeof value === 'string' ? JSON.parse(value) : value
        ) as ModelExecutionPolicy
    } catch {
        throw executionError('Invalid')
    }
}

@Injectable()
export class ModelExecutionPolicyService {
    constructor(@InjectRepository(TenantSetting) private readonly settings: Repository<TenantSetting>) {}
    async get(tenantId: string) {
        const setting = await this.settings.findOneBy({ tenantId, name: MODEL_EXECUTION_POLICY_SETTING })
        return parseExecutionPolicy(setting?.value)
    }
    async set(tenantId: string, input: unknown) {
        const policy = parseExecutionPolicy(input)
        await this.settings.manager.transaction(async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
                `model-execution-policy:${tenantId}`
            ])
            const repository = manager.getRepository(TenantSetting)
            const setting =
                (await repository.findOneBy({ tenantId, name: MODEL_EXECUTION_POLICY_SETTING })) ??
                repository.create({ tenantId, name: MODEL_EXECUTION_POLICY_SETTING })
            setting.value = JSON.stringify(policy)
            await repository.save(setting)
        })
        return policy
    }
    async require(tenantId: string) {
        const policy = await this.get(tenantId)
        if (!policy.enabled) throw executionError('Unavailable')
        return policy
    }
}
