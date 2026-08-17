import {
    AiModelTypeEnum,
    IModelAccessResolution,
    mapTranslationLanguage,
    ModelUsagePricingContext,
    ModelUsageReport
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { IAIModelProviderStrategy } from '@xpert-ai/plugin-sdk'
import { Logger } from '@nestjs/common'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { AIModelGetProviderQuery } from '../../../ai-model'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider'
import { CopilotCheckLimitCommand, CopilotModelUsageRecordCommand } from '../../../copilot-user'
import { CopilotModelInvalidException, ExceedingLimitException } from '../../../core/errors'
import { CopilotModelGetRerankQuery } from '../get-rerank.query'

@QueryHandler(CopilotModelGetRerankQuery)
export class CopilotModelGetRerankHandler implements IQueryHandler<CopilotModelGetRerankQuery> {
    readonly #logger = new Logger(CopilotModelGetRerankHandler.name)

    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly i18nService: I18nService
    ) {}

    public async execute(command: CopilotModelGetRerankQuery) {
        const copilotModel = command.copilotModel ?? command.copilot.copilotModel
        if (copilotModel?.modelType !== AiModelTypeEnum.RERANK) {
            throw new CopilotModelInvalidException(
                await this.i18nService.t('copilot.Error.NoRerankModel', {
                    lang: mapTranslationLanguage(RequestContext.getLanguageCode())
                })
            )
        }

        const copilot = command.copilot
        const modelName = copilotModel.model
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        const modelAccess = await this.commandBus.execute<CopilotCheckLimitCommand, IModelAccessResolution>(
            new CopilotCheckLimitCommand({
                tenantId,
                organizationId,
                userId,
                xpertId: command.options?.xpertId,
                copilot,
                model: modelName,
                modelType: copilotModel.modelType
            })
        )
        // Custom model
        const customModels = await this.queryBus.execute(
            new GetCopilotProviderModelQuery(copilot.modelProvider.id, { modelName })
        )

        const modelProvider = await this.queryBus.execute<AIModelGetProviderQuery, IAIModelProviderStrategy>(
            new AIModelGetProviderQuery(copilot.modelProvider.providerName)
        )
        const resolveUsagePricingSnapshot = async (context: ModelUsagePricingContext) =>
            modelProvider
                .getModelManager(copilotModel.modelType)
                .getUsagePricingSnapshot(modelName, copilot.modelProvider.credentials, {
                    ...context,
                    model: modelName
                })
        return modelProvider.getModelInstance(
            copilotModel.modelType,
            {
                ...copilotModel,
                copilot
            },
            {
                verbose: Logger.isLevelEnabled('verbose'),
                modelProperties: customModels[0]?.modelProperties,
                resolveUsagePricingSnapshot,
                handleModelUsage: async (report: ModelUsageReport) => {
                    const normalizedReport: ModelUsageReport = {
                        ...report,
                        model: modelName,
                        modelType: copilotModel.modelType
                    }
                    await command.options?.modelUsageCallback?.(normalizedReport)
                    const pricingSnapshot =
                        normalizedReport.pricingSnapshot ??
                        (await resolveUsagePricingSnapshot({
                            model: modelName,
                            operation: normalizedReport.operation,
                            modality: normalizedReport.modality,
                            pricingDimensions: normalizedReport.pricingDimensions,
                            startedAt: normalizedReport.recordedAt
                        }))
                    await this.recordModelUsage(
                        new CopilotModelUsageRecordCommand({
                            tenantId,
                            organizationId,
                            userId,
                            xpertId: command.options?.xpertId,
                            originId: command.options?.threadId,
                            copilot,
                            modelAccess,
                            report: normalizedReport,
                            pricingSnapshot
                        }),
                        command.options?.abortController
                    )
                },
                handleLLMTokens: () => undefined
            }
        )
    }

    private async recordModelUsage(command: CopilotModelUsageRecordCommand, abortController?: AbortController) {
        try {
            await this.commandBus.execute(command)
        } catch (error) {
            if (error instanceof ExceedingLimitException) {
                if (abortController && !abortController.signal.aborted) {
                    abortController.abort(error.message)
                }
                return
            }
            this.#logger.error(error)
        }
    }
}
