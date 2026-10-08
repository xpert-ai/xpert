import { MODEL_EXECUTION_POLICY_SETTING, ModelExecutionPolicy } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TenantSetting } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { executionError } from './execution-errors'

import { ExecutionPolicyInput, executionPolicySchema } from './execution-policy.schema'
export { executionPolicySchema } from './execution-policy.schema'
export { executionLimitsSchema } from './execution-schema'

export function parseExecutionPolicy(value: unknown): ModelExecutionPolicy {
    try {
        return executionPolicySchema.parse(
            value === undefined || value === null || value === ''
                ? {}
                : typeof value === 'string'
                  ? JSON.parse(value)
                  : value
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
    async set(tenantId: string, policy: ExecutionPolicyInput) {
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
        return this.get(tenantId)
    }
}
