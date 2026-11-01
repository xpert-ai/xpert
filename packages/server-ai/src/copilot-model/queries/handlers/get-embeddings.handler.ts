import { AiModelTypeEnum, ILLMUsage, mapTranslationLanguage } from '@xpert-ai/contracts'
import { normalizeTokenUsage, RequestContext } from '@xpert-ai/plugin-sdk'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { CopilotModelInvalidException } from '../../../core/errors'
import { CopilotModelGetChatModelQuery } from '../get-chat-model.query'
import { CopilotModelGetEmbeddingsQuery } from '../get-embeddings.query'

@QueryHandler(CopilotModelGetEmbeddingsQuery)
export class CopilotModelGetEmbeddingsHandler implements IQueryHandler<CopilotModelGetEmbeddingsQuery> {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly i18nService: I18nService
    ) {}

    public async execute(command: CopilotModelGetEmbeddingsQuery) {
        const copilotModel = command.copilotModel ?? command.copilot.copilotModel
        if (copilotModel?.modelType !== AiModelTypeEnum.TEXT_EMBEDDING) {
            throw new CopilotModelInvalidException(
                await this.i18nService.t('copilot.Error.NoTextEmbeddingModel', {
                    lang: mapTranslationLanguage(RequestContext.getLanguageCode())
                })
            )
        }

        const { tokenCallback, ...options } = command.options ?? {}
        // Both callbacks observe the same usage event; ledger writes remain in the shared model handler.
        return await this.queryBus.execute(
            new CopilotModelGetChatModelQuery(command.copilot, copilotModel, {
                ...options,
                modelUsageCallback: tokenCallback
                    ? async (report) => {
                          await options.modelUsageCallback?.(report)
                          const tokens = report.metrics.reduce(
                              (total, metric) =>
                                  metric.unit === 'token'
                                      ? total + (normalizeTokenUsage(metric)?.totalTokens ?? 0)
                                      : total,
                              0
                          )
                          if (Number.isSafeInteger(tokens) && tokens > 0) await tokenCallback(tokens)
                      }
                    : options.modelUsageCallback,
                usageCallback: tokenCallback ? (usage: ILLMUsage) => tokenCallback(usage.totalTokens) : undefined
            })
        )
    }
}
