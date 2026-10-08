import { mapTranslationLanguage } from '@xpert-ai/contracts'
import { InvalidConfigurationException } from '@xpert-ai/server-core'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { CopilotGetOneQuery } from '../../../copilot/queries'
import { ExceedingLimitException } from '../../../core/errors'
import { ModelAccessService } from '../../../model-access'
import { CopilotUsageService } from '../../../copilot-usage'
import { CopilotTokenUsageDeliveryService } from '../../copilot-token-usage-delivery.service'
import { CopilotTokenRecordCommand } from '../token-record.command'

@CommandHandler(CopilotTokenRecordCommand)
export class CopilotTokenRecordHandler implements ICommandHandler<CopilotTokenRecordCommand> {
    constructor(
        private readonly queryBus: QueryBus,
        private readonly modelAccessService: ModelAccessService,
        private readonly copilotUsageService: CopilotUsageService,
        private readonly tokenUsageDeliveryService: CopilotTokenUsageDeliveryService,
        private readonly i18nService: I18nService
    ) {}

    public async execute(command: CopilotTokenRecordCommand): Promise<void> {
        const { input } = command
        const { organizationId, userId, model, tokenUsed, xpertId, threadId } = input
        const copilotId = input.copilotId ?? input.copilot?.id

        if (!model) {
            throw new InvalidConfigurationException(
                await this.i18nService.t('copilot.Error.TokenNoModel', {
                    lang: mapTranslationLanguage(RequestContext.getLanguageCode())
                })
            )
        }

        if (tokenUsed > 0) {
            const copilot = await this.queryBus.execute(
                new CopilotGetOneQuery(input.tenantId, copilotId, ['modelProvider'])
            )
            const modelType = input.modelType ?? copilot.copilotModel?.modelType
            if (!modelType) {
                throw new InvalidConfigurationException(
                    await this.i18nService.t('copilot.Error.TokenNoModel', {
                        lang: mapTranslationLanguage(RequestContext.getLanguageCode())
                    })
                )
            }
            const modelAccess =
                input.modelAccess ??
                (await this.modelAccessService.assertCanUseModel({
                    tenantId: input.tenantId,
                    organizationId,
                    userId,
                    xpertId,
                    copilotId,
                    copilotModelId: model,
                    modelType
                }))
            const billableUserId = modelAccess.billableUserId
            // Replays must use the same provider scope for ledger and quota-delivery deduplication.
            // A null provider organization is the pinned tenant scope, not a missing value.
            const usageSource = input.executionModel
                ? {
                      id: input.executionModel.copilotId,
                      organizationId: input.executionModel.providerOrganizationId,
                      tokenBalance: copilot.tokenBalance,
                      modelProvider: {
                          id: input.executionModel.providerScopeId,
                          providerName: input.executionModel.provider
                      }
                  }
                : copilot
            await this.copilotUsageService.recordTokenUsage(
                {
                    tenantId: input.tenantId,
                    organizationId,
                    copilotOrganizationId: usageSource.organizationId ?? null,
                    userId: billableUserId,
                    execution: input.execution,
                    originId: threadId,
                    xpertId,
                    copilotId: usageSource.id,
                    providerScopeId: usageSource.modelProvider.id ?? usageSource.id,
                    provider: usageSource.modelProvider.providerName,
                    modelAccess
                },
                {
                    tokenDetails: input.tokenDetails,
                    requestId: input.requestId,
                    model,
                    modelType,
                    promptTokens: input.promptTokens,
                    completionTokens: input.completionTokens,
                    totalTokens: tokenUsed,
                    priceAmount: input.priceUsed,
                    priceCurrency: input.currency,
                    pricingStatus: input.pricingStatus,
                    priceAuthority: input.priceAuthority,
                    pricingBreakdown: input.pricingBreakdown
                }
            )
            const delivery = await this.tokenUsageDeliveryService.deliver(input, usageSource, billableUserId)
            if (delivery.userTokenLimitExceeded) {
                throw new ExceedingLimitException(
                    await this.i18nService.t('copilot.Error.TokenExceedsLimit', {
                        lang: mapTranslationLanguage(RequestContext.getLanguageCode())
                    })
                )
            }

            if (delivery.organizationTokenLimitExceeded) {
                throw new ExceedingLimitException(
                    await this.i18nService.t('copilot.Error.TokenExceedsOrgLimit', {
                        lang: mapTranslationLanguage(RequestContext.getLanguageCode())
                    })
                )
            }
        }
    }
}
