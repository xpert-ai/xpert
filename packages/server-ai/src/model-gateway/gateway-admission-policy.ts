import { TenantSetting } from '@xpert-ai/server-core'
import { In, Repository } from 'typeorm'
import {
    TModelGatewaySettingsUpdateInput,
    MODEL_GATEWAY_REQUESTS_PER_MINUTE_SETTING,
    MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS_SETTING,
    DEFAULT_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
    DEFAULT_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS,
    MIN_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
    MIN_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS,
    MAX_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
    MAX_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS
} from '@xpert-ai/contracts'
import { parseBoundedInteger } from './model-gateway.support'

export class GatewayAdmissionPolicy {
    constructor(private readonly repository: Repository<TenantSetting>) {}
    async getAdmissionLimits(tenantId: string) {
        const settings = await this.repository.find({
            where: {
                tenantId,
                name: In([MODEL_GATEWAY_REQUESTS_PER_MINUTE_SETTING, MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS_SETTING])
            }
        })
        const byName = new Map(settings.map((setting) => [setting.name, setting.value]))
        return {
            requestsPerMinute: parseBoundedInteger(
                byName.get(MODEL_GATEWAY_REQUESTS_PER_MINUTE_SETTING),
                DEFAULT_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
                MIN_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
                MAX_MODEL_GATEWAY_REQUESTS_PER_MINUTE
            ),
            maxConcurrentRequests: parseBoundedInteger(
                byName.get(MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS_SETTING),
                DEFAULT_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS,
                MIN_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS,
                MAX_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS
            )
        }
    }

    async saveAdmissionLimits(
        tenantId: string,
        input: Pick<TModelGatewaySettingsUpdateInput, 'requestsPerMinute' | 'maxConcurrentRequests'>
    ) {
        const values = [
            {
                name: MODEL_GATEWAY_REQUESTS_PER_MINUTE_SETTING,
                value: String(input.requestsPerMinute)
            },
            {
                name: MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS_SETTING,
                value: String(input.maxConcurrentRequests)
            }
        ]
        const existing = await this.repository.find({
            where: {
                tenantId,
                name: In(values.map(({ name }) => name))
            }
        })
        const settings = values.map(({ name, value }) => {
            const setting = existing.find((item) => item.name === name) ?? this.repository.create({ tenantId, name })
            setting.value = value
            return setting
        })
        await this.repository.save(settings)
    }
}
