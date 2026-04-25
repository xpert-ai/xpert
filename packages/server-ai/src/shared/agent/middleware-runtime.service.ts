import { ICopilotModel, IXpertAgentExecution, mapTranslationLanguage } from '@xpert-ai/contracts'
import { omit } from '@xpert-ai/server-common'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
  AIModelProviderNotFoundException,
  AgentMiddlewareCreateModelClientOptions,
  AgentMiddlewareModelClient,
  AgentMiddlewareRuntimeApi,
  AgentMiddlewareWrapWorkflowNodeExecutionParams,
  AgentMiddlewareWrapWorkflowNodeExecutionResult,
  RequestContext,
} from '@xpert-ai/plugin-sdk'
import { I18nService } from 'nestjs-i18n'
import { t } from 'i18next'
import { ModelProvider } from '../../ai-model/ai-provider'
import { AIModelGetProviderQuery } from '../../ai-model/queries/get-provider.query'
import { GetCopilotProviderModelQuery } from '../../copilot-provider/queries/get-model.query'
import { CopilotCheckLimitCommand } from '../../copilot-user/commands/check-limit.command'
import { CopilotTokenRecordCommand } from '../../copilot-user/commands/token-record.command'
import { CopilotModelNotFoundException, ExceedingLimitException } from '../../core/errors'
import { CopilotGetOneQuery } from '../../copilot/queries/get-one.query'
import { ensureCopilotModelContextSize } from '../../copilot-model/utils/context-size'
import { wrapAgentExecution } from './execution'

@Injectable()
export class AgentMiddlewareRuntimeService {
  readonly #logger = new Logger(AgentMiddlewareRuntimeService.name)

  async createModelClient<T = AgentMiddlewareModelClient>(
    copilotModel: ICopilotModel,
    options: AgentMiddlewareCreateModelClientOptions
  ): Promise<T> {
    const { abortController, usageCallback } = options ?? {}
    const tenantId = RequestContext.currentTenantId()
    const organizationId = RequestContext.getOrganizationId()
    const userId = RequestContext.currentUserId()

    if (!copilotModel) {
      throw new CopilotModelNotFoundException(
        this.i18nService.t('copilot.Error.AIModelNotFound', {
          lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
        })
      )
    }

    const modelName = copilotModel.model
    const copilot = await this.queryBus.execute(
      new CopilotGetOneQuery(tenantId, copilotModel.copilotId, ['modelProvider'])
    )

    await this.commandBus.execute(
      new CopilotCheckLimitCommand({
        tenantId,
        organizationId,
        userId,
        copilot,
        model: modelName,
      })
    )

    const customModels = await this.queryBus.execute(
      new GetCopilotProviderModelQuery(copilot.modelProvider.id, { modelName })
    )

    const modelProvider = await this.queryBus.execute<AIModelGetProviderQuery, ModelProvider>(
      new AIModelGetProviderQuery(copilot.modelProvider.providerName)
    )

    if (!modelProvider) {
      throw new AIModelProviderNotFoundException(
        t('server-ai:Error.AIModelProviderNotFound', { name: copilot.modelProvider.providerName })
      )
    }

    ensureCopilotModelContextSize(copilotModel, modelProvider, modelName, customModels)

    return modelProvider.getModelInstance(
      copilotModel.modelType,
      {
        ...copilotModel,
        copilot,
      },
      {
        verbose: Logger.isLevelEnabled('verbose'),
        modelProperties: customModels[0]?.modelProperties,
        handleLLMTokens: async (input) => {
          if (usageCallback && input.usage) {
            usageCallback(input.usage)
          }

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
                currency: input.usage?.currency,
              })
            )
          } catch (error) {
            if (error instanceof ExceedingLimitException) {
              if (abortController && !abortController.signal.aborted) {
                try {
                  abortController.abort(error.message)
                } catch {
                  // Ignore abort races.
                }
              }
            } else {
              this.#logger.error(error)
            }
          }
        },
      }
    ) as T
  }

  async wrapWorkflowNodeExecution<T>(
    run: (execution: Partial<IXpertAgentExecution>) => Promise<AgentMiddlewareWrapWorkflowNodeExecutionResult<T>>,
    params: AgentMiddlewareWrapWorkflowNodeExecutionParams
  ): Promise<T> {
    return wrapAgentExecution(run, {
      ...params,
      commandBus: this.commandBus,
      queryBus: this.queryBus,
    })()
  }

  readonly api: AgentMiddlewareRuntimeApi = {
    createModelClient: (...args) => this.createModelClient(...args),
    wrapWorkflowNodeExecution: (...args) => this.wrapWorkflowNodeExecution(...args),
  }

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly i18nService: I18nService
  ) {}
}
