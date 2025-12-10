import { mapTranslationLanguage } from '@metad/contracts'
import { omit } from '@metad/server-common'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { AIModelProviderNotFoundException, CreateModelClientCommand, RequestContext } from '@xpert-ai/plugin-sdk'
import { I18nService } from 'nestjs-i18n'
import { t } from 'i18next';
import { AIModelGetProviderQuery, ModelProvider } from '../../../ai-model'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider'
import { CopilotCheckLimitCommand, CopilotTokenRecordCommand } from '../../../copilot-user'
import { CopilotModelNotFoundException, ExceedingLimitException } from '../../../core/errors'
import { CopilotGetOneQuery } from '../../../copilot/queries'


@CommandHandler(CreateModelClientCommand)
export class CreateModelClientHandler implements ICommandHandler<CreateModelClientCommand> {
  readonly #logger = new Logger(CreateModelClientHandler.name)

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly i18nService: I18nService
  ) {}

  public async execute(command: CreateModelClientCommand) {
    const { abortController, usageCallback } = command.options ?? {}
    const tenantId = RequestContext.currentTenantId()
    const organizationId = RequestContext.getOrganizationId()
    const userId = RequestContext.currentUserId()

    const copilotModel = command.copilotModel
    if (!copilotModel) {
      throw new CopilotModelNotFoundException(
        this.i18nService.t('copilot.Error.AIModelNotFound', {
          lang: mapTranslationLanguage(RequestContext.getLanguageCode())
        })
      )
    }
    const modelName = copilotModel.model

    const copilot = await this.queryBus.execute(new CopilotGetOneQuery(tenantId, copilotModel.copilotId, ['modelProvider']))

    // Check token limit
    await this.commandBus.execute(
      new CopilotCheckLimitCommand({
        tenantId,
        organizationId,
        userId,
        copilot,
        model: modelName
      })
    )

    // Custom model
    const customModels = await this.queryBus.execute(
      new GetCopilotProviderModelQuery(copilot.modelProvider.id, {modelName})
    )

    const modelProvider = await this.queryBus.execute<AIModelGetProviderQuery, ModelProvider>(
      new AIModelGetProviderQuery(copilot.modelProvider.providerName)
    )

    if (!modelProvider) {
      throw new AIModelProviderNotFoundException(
        t('server-ai:Error.AIModelProviderNotFound', {name: copilot.modelProvider.providerName})
      )
    }

    return modelProvider.getModelInstance(
      copilotModel.modelType,
      {
        ...copilotModel,
        copilot
      },
      {
        verbose: Logger.isLevelEnabled('verbose'),
        modelProperties: customModels[0]?.modelProperties,
        handleLLMTokens: async (input) => {
          if (usageCallback && input.usage) {
            usageCallback(input.usage)
          }

          // Record token usage and abort if error
          try {
            await this.commandBus.execute(
              new CopilotTokenRecordCommand({
                ...omit(input, 'usage'),
                tenantId,
                organizationId,
                userId,
                copilot,
                model: input.model,
                tokenUsed: input.usage?.totalTokens,
                priceUsed: input.usage?.totalPrice,
                currency: input.usage?.currency
              })
            )
          } catch (err) {
            if (err instanceof ExceedingLimitException) {
              if (abortController && !abortController.signal.aborted) {
                try {
                  abortController.abort(err.message)
                } catch (err) {
                  //
                }
              }
            } else {
              this.#logger.error(err)
            }
          }
        }
      }
    )
  }
}
