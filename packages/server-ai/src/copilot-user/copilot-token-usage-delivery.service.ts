import { USAGE_HOUR_FORMAT } from '@xpert-ai/contracts'
import { InvalidConfigurationException } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { t } from 'i18next'
import { createHash } from 'node:crypto'
import { DataSource } from 'typeorm'
import { CopilotOrganizationService } from '../copilot-organization/copilot-organization.service'
import { ModelUsageDeliveryReceipt } from '../copilot-usage/model-usage/model-usage-delivery-receipt.entity'
import { formatInUTC0 } from '../shared/utils'
import { CopilotUserService } from './copilot-user.service'
import { CopilotTokenRecordCommand } from './commands/token-record.command'

type CopilotUsageSource = {
    id: string
    organizationId?: string | null
    tokenBalance?: number | null
    modelProvider: {
        id?: string | null
        providerName: string
    }
}

export type CopilotTokenUsageDeliveryResult = {
    userTokenLimitExceeded: boolean
    organizationTokenLimitExceeded: boolean
}

@Injectable()
export class CopilotTokenUsageDeliveryService {
    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
        private readonly copilotUserService: CopilotUserService,
        private readonly copilotOrganizationService: CopilotOrganizationService
    ) {}

    async deliver(
        input: CopilotTokenRecordCommand['input'],
        copilot: CopilotUsageSource,
        billableUserId: string
    ): Promise<CopilotTokenUsageDeliveryResult> {
        const providerScopeId = copilot.modelProvider.id ?? copilot.id
        const payloadFingerprint = fingerprintDelivery(input, copilot, billableUserId)

        return this.dataSource.transaction(async (manager) => {
            const receiptRepository = manager.getRepository(ModelUsageDeliveryReceipt)
            await receiptRepository
                .createQueryBuilder()
                .insert()
                .values({
                    tenantId: input.tenantId,
                    providerScopeId,
                    requestId: input.requestId,
                    payloadFingerprint,
                    status: 'pending'
                })
                .orIgnore()
                .execute()

            const receipt = await receiptRepository.findOne({
                where: {
                    tenantId: input.tenantId,
                    providerScopeId,
                    requestId: input.requestId
                },
                lock: { mode: 'pessimistic_write' }
            })
            if (!receipt) {
                throw new InvalidConfigurationException(
                    t('server-ai:Error.ModelUsageDeliveryReceiptMissing', {
                        defaultValue: 'The model usage delivery receipt could not be loaded'
                    })
                )
            }
            if (receipt.payloadFingerprint !== payloadFingerprint) {
                throw new InvalidConfigurationException(
                    t('server-ai:Error.ModelUsageDeliveryPayloadMismatch', {
                        defaultValue: 'The model usage request was replayed with different billing data'
                    })
                )
            }
            if (receipt.status === 'completed') {
                return {
                    userTokenLimitExceeded: receipt.userTokenLimitExceeded,
                    organizationTokenLimitExceeded: receipt.organizationTokenLimitExceeded
                }
            }

            const usageHour = formatInUTC0(new Date(), USAGE_HOUR_FORMAT)
            const userRecord = await this.copilotUserService.upsert(
                {
                    copilotId: input.copilotId ?? input.copilot?.id,
                    organizationId: input.organizationId,
                    userId: billableUserId,
                    xpertId: input.xpertId,
                    threadId: input.threadId,
                    orgId: copilot.organizationId,
                    provider: copilot.modelProvider.providerName,
                    model: input.model,
                    usageHour,
                    tokenLimit: copilot.tokenBalance,
                    tokenUsed: input.tokenUsed,
                    priceUsed: input.priceUsed,
                    currency: input.currency
                },
                manager
            )
            receipt.userRollupDeliveredAt = new Date()

            let organizationTokenLimitExceeded = false
            if (input.organizationId) {
                const organizationRecord = await this.copilotOrganizationService.upsert(
                    {
                        tenantId: input.tenantId,
                        tokenUsed: input.tokenUsed,
                        organizationId: input.organizationId,
                        copilotId: input.copilotId ?? input.copilot?.id,
                        provider: copilot.modelProvider.providerName,
                        model: input.model,
                        tokenLimit: copilot.tokenBalance,
                        priceUsed: input.priceUsed,
                        currency: input.currency
                    },
                    manager
                )
                organizationTokenLimitExceeded = Boolean(
                    organizationRecord.tokenLimit && organizationRecord.tokenUsed >= organizationRecord.tokenLimit
                )
            }
            receipt.organizationRollupDeliveredAt = new Date()
            receipt.userTokenLimitExceeded = Boolean(
                userRecord.tokenLimit && userRecord.tokenUsed >= userRecord.tokenLimit
            )
            receipt.organizationTokenLimitExceeded = organizationTokenLimitExceeded
            receipt.status = 'completed'
            receipt.completedAt = new Date()
            await receiptRepository.save(receipt)

            return {
                userTokenLimitExceeded: receipt.userTokenLimitExceeded,
                organizationTokenLimitExceeded: receipt.organizationTokenLimitExceeded
            }
        })
    }
}

function fingerprintDelivery(
    input: CopilotTokenRecordCommand['input'],
    copilot: CopilotUsageSource,
    billableUserId: string
) {
    return createHash('sha256')
        .update(
            JSON.stringify({
                tenantId: input.tenantId,
                organizationId: input.organizationId ?? null,
                billableUserId,
                xpertId: input.xpertId ?? null,
                threadId: input.threadId ?? null,
                copilotId: input.copilotId ?? input.copilot?.id ?? null,
                copilotOrganizationId: copilot.organizationId ?? null,
                provider: copilot.modelProvider.providerName,
                model: input.model,
                modelType: input.modelType ?? null,
                promptTokens: input.promptTokens ?? null,
                completionTokens: input.completionTokens ?? null,
                tokenUsed: input.tokenUsed,
                priceUsed: input.priceUsed ?? null,
                currency: input.currency ?? null,
                pricingStatus: input.pricingStatus ?? null,
                priceAuthority: input.priceAuthority ?? null,
                pricingBreakdown: input.pricingBreakdown ?? null
            })
        )
        .digest('hex')
}
