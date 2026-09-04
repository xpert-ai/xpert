import { randomUUID } from 'crypto'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
    AiModelTypeEnum,
    AiProviderRole,
    ChatMessageEventTypeEnum,
    ICopilotModel,
    IModelAccessResolution,
    IXpertAgentExecution,
    ModelUsagePricingContext,
    mapTranslationLanguage
} from '@xpert-ai/contracts'
import { omit } from '@xpert-ai/server-common'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
    AIModelProviderNotFoundException,
    IAIModelProviderStrategy,
    AgentMiddlewareCreateModelClientOptions,
    AgentMiddlewareEvent,
    AgentMiddlewareModelClient,
    AgentMiddlewareModelProviderConnection,
    AgentMiddlewareRuntimeScope,
    AgentMiddlewareWrapWorkflowNodeExecutionParams,
    AgentMiddlewareWrapWorkflowNodeExecutionResult,
    RequestContext
} from '@xpert-ai/plugin-sdk'
import { I18nService } from 'nestjs-i18n'
import { t } from 'i18next'
import { AIModelGetProviderQuery } from '../../../ai-model/queries/get-provider.query'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider/queries/get-model.query'
import { CopilotCheckLimitCommand } from '../../../copilot-user/commands/check-limit.command'
import { CopilotTokenRecordCommand } from '../../../copilot-user/commands/token-record.command'
import { CopilotModelNotFoundException, ExceedingLimitException } from '../../../core/errors'
import { CopilotGetOneQuery } from '../../../copilot/queries/get-one.query'
import { CopilotService } from '../../../copilot/copilot.service'
import { CopilotUsageService } from '../../../copilot-usage'
import { ensureCopilotModelContextSize } from '../../../copilot-model/utils/context-size'
import { applicationMetrics } from '../../../metrics'
import { wrapAgentExecution } from '../execution'
import { normalizeOptionalString } from './utils'

export type AgentMiddlewareRuntimeModelOptions = AgentMiddlewareCreateModelClientOptions & {
    modelAccessOverride?: IModelAccessResolution
    skipTokenRecord?: boolean
    purpose?: 'invoke' | 'observe'
}

const MODEL_PROVIDER_ROLE_PRIORITY = [
    AiProviderRole.Primary,
    AiProviderRole.Secondary,
    AiProviderRole.Reasoning,
    AiProviderRole.Embedding
]

@Injectable()
export class AgentMiddlewareModelRuntimeService {
    readonly #logger = new Logger(AgentMiddlewareModelRuntimeService.name)

    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly i18nService: I18nService,
        private readonly copilotService: CopilotService,
        private readonly copilotUsage: CopilotUsageService
    ) {}

    async createModelClient<T = AgentMiddlewareModelClient>(
        copilotModel: ICopilotModel,
        options: AgentMiddlewareRuntimeModelOptions,
        scope: AgentMiddlewareRuntimeScope = {},
        recordApplicationMetrics = false
    ): Promise<T> {
        const {
            abortController,
            usageCallback,
            modelAccessOverride,
            skipTokenRecord,
            purpose = 'invoke'
        } = options ?? {}
        const tenantId = scope.tenantId ?? RequestContext.currentTenantId()
        const organizationId = scope.organizationId ?? RequestContext.getOrganizationId()
        const userId = scope.userId ?? RequestContext.currentUserId()
        const xpertId = scope.xpertId ?? undefined

        if (!copilotModel) {
            throw new CopilotModelNotFoundException(
                this.i18nService.t('copilot.Error.AIModelNotFound', {
                    lang: mapTranslationLanguage(RequestContext.getLanguageCode())
                })
            )
        }

        const modelName = copilotModel.model
        const copilot = await this.queryBus.execute(
            new CopilotGetOneQuery(tenantId, copilotModel.copilotId, ['modelProvider'])
        )

        const modelAccess =
            modelAccessOverride ??
            (purpose === 'observe'
                ? undefined
                : await this.commandBus.execute<CopilotCheckLimitCommand, IModelAccessResolution>(
                      new CopilotCheckLimitCommand({
                          tenantId,
                          organizationId,
                          userId,
                          xpertId,
                          copilot,
                          model: modelName,
                          modelType: copilotModel.modelType
                      })
                  ))

        const customModels = await this.queryBus.execute(
            new GetCopilotProviderModelQuery(copilot.modelProvider.id, { modelName })
        )

        const modelProvider = await this.queryBus.execute<AIModelGetProviderQuery, IAIModelProviderStrategy>(
            new AIModelGetProviderQuery(copilot.modelProvider.providerName)
        )

        if (!modelProvider) {
            throw new AIModelProviderNotFoundException(
                t('server-ai:Error.AIModelProviderNotFound', { name: copilot.modelProvider.providerName })
            )
        }

        if (copilotModel.modelType === AiModelTypeEnum.LLM) {
            ensureCopilotModelContextSize(copilotModel, modelProvider, modelName, customModels)
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
                    if (purpose === 'observe') {
                        return
                    }
                    if (input.usage) {
                        if (scope.usageCallback) {
                            await scope.usageCallback(input.usage)
                        }
                        if (usageCallback && usageCallback !== scope.usageCallback) {
                            await usageCallback(input.usage)
                        }
                        if (recordApplicationMetrics && input.usage.type !== 'estimated') {
                            applicationMetrics.recordLlmUsage({
                                provider: copilot.modelProvider.providerName,
                                model: input.model ?? modelName,
                                inputTokens: input.usage.promptTokens,
                                outputTokens: input.usage.completionTokens,
                                totalTokens: input.usage.totalTokens,
                                totalPrice:
                                    input.usage.pricingStatus === 'unpriced' ? undefined : input.usage.totalPrice,
                                currency: input.usage.currency,
                                responseLatencySeconds:
                                    typeof input.usage.latency === 'number' ? input.usage.latency / 1000 : undefined
                            })
                        }
                    }

                    if (skipTokenRecord || input.usage?.type === 'estimated') {
                        return
                    }
                    try {
                        await this.commandBus.execute(
                            new CopilotTokenRecordCommand({
                                ...omit(input, 'usage'),
                                tenantId,
                                requestId: input.requestId ?? randomUUID(),
                                organizationId,
                                userId,
                                xpertId,
                                copilot,
                                model: input.model,
                                modelType: copilotModel.modelType,
                                modelAccess,
                                promptTokens: input.usage?.promptTokens,
                                completionTokens: input.usage?.completionTokens,
                                tokenUsed: input.usage?.totalTokens,
                                priceUsed:
                                    input.usage?.pricingStatus === 'unpriced' ? undefined : input.usage?.totalPrice,
                                currency: input.usage?.currency,
                                pricingStatus: input.usage?.pricingStatus,
                                priceAuthority: input.usage?.priceAuthority,
                                pricingBreakdown: input.usage?.pricingBreakdown
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
                }
            }
        ) as T
    }

    async getModelProvider(
        provider: string,
        scope: AgentMiddlewareRuntimeScope = {}
    ): Promise<AgentMiddlewareModelProviderConnection> {
        const providerName = normalizeOptionalString(provider)
        const tenantId = normalizeOptionalString(scope.tenantId) ?? RequestContext.currentTenantId()
        const organizationId = normalizeOptionalString(scope.organizationId) ?? RequestContext.getOrganizationId()
        const providerScopeId = normalizeOptionalString(scope.providerScopeId)
        const userId = normalizeOptionalString(scope.userId) ?? RequestContext.currentUserId()
        const xpertId = normalizeOptionalString(scope.xpertId)
        if (!providerName || !tenantId) {
            throw new Error(
                t('server-ai:Error.ToolModelProviderContextRequired', {
                    defaultValue: 'A tenant-scoped model provider name is required.'
                }) || 'A tenant-scoped model provider name is required.'
            )
        }

        const copilots = await this.copilotService.findAllEnabledCopilotsWithoutMembership(tenantId, organizationId)
        const candidates = copilots
            .filter(
                (copilot) =>
                    copilot.modelProvider?.providerName === providerName &&
                    (!providerScopeId || copilot.modelProvider.id === providerScopeId) &&
                    copilot.modelProvider.isValid !== false &&
                    !!copilot.modelProvider.id &&
                    !!copilot.modelProvider.credentials &&
                    Object.keys(copilot.modelProvider.credentials).length > 0
            )
            .sort((left, right) => {
                const leftOrganization = left.modelProvider?.organizationId === organizationId ? 0 : 1
                const rightOrganization = right.modelProvider?.organizationId === organizationId ? 0 : 1
                if (leftOrganization !== rightOrganization) return leftOrganization - rightOrganization

                const leftRole = MODEL_PROVIDER_ROLE_PRIORITY.indexOf(left.role)
                const rightRole = MODEL_PROVIDER_ROLE_PRIORITY.indexOf(right.role)
                if (leftRole !== rightRole) return leftRole - rightRole
                return String(left.modelProvider?.id).localeCompare(String(right.modelProvider?.id))
            })
        const connection = candidates[0]?.modelProvider
        if (!connection) {
            throw new Error(
                t('server-ai:Error.ToolModelProviderNotConfigured', {
                    name: providerName,
                    defaultValue:
                        "Model provider '{{name}}' is not configured or enabled. Configure it in Model Providers before using this tool."
                }) ||
                    `Model provider '${providerName}' is not configured or enabled. Configure it in Model Providers before using this tool.`
            )
        }

        const modelProvider = await this.queryBus.execute<AIModelGetProviderQuery, IAIModelProviderStrategy>(
            new AIModelGetProviderQuery(providerName)
        )
        if (!modelProvider) {
            throw new AIModelProviderNotFoundException(
                t('server-ai:Error.AIModelProviderNotFound', { name: providerName })
            )
        }

        const resolvePricingSnapshot: AgentMiddlewareModelProviderConnection['resolvePricingSnapshot'] = async (
            context
        ) => {
            const modelType = resolveUsageModelType(context)
            return modelProvider
                .getModelManager(modelType)
                .getUsagePricingSnapshot(context.model, connection.credentials, context)
        }
        const resolveModelAccess: AgentMiddlewareModelProviderConnection['resolveModelAccess'] = async (context) =>
            this.commandBus.execute<CopilotCheckLimitCommand, IModelAccessResolution>(
                new CopilotCheckLimitCommand({
                    tenantId,
                    organizationId,
                    userId,
                    xpertId,
                    copilot: candidates[0],
                    model: context.model,
                    modelType: resolveUsageModelType(context)
                })
            )

        return {
            providerScopeId: connection.id,
            copilotId: candidates[0].id,
            organizationId: candidates[0].organizationId ?? null,
            provider: providerName,
            baseURL: modelProvider.getBaseUrl(connection.credentials),
            authorization: modelProvider.getAuthorization(connection.credentials),
            resolveModelAccess,
            resolvePricingSnapshot,
            reportUsage: async (report, modelAccess) => {
                const resolvedModelAccess =
                    modelAccess ??
                    (report.model
                        ? await resolveModelAccess({
                              requestId: report.requestId,
                              model: report.model,
                              operation: report.operation,
                              modality: report.modality,
                              pricingDimensions: report.pricingDimensions,
                              startedAt: report.recordedAt
                          })
                        : undefined)
                const pricingSnapshot =
                    report.pricingSnapshot ??
                    (report.model
                        ? await resolvePricingSnapshot({
                              model: report.model,
                              operation: report.operation,
                              modality: report.modality,
                              pricingDimensions: report.pricingDimensions,
                              startedAt: report.recordedAt
                          })
                        : { capturedAt: new Date().toISOString(), rules: [] })
                return this.copilotUsage.recordModelUsage(
                    {
                        tenantId,
                        organizationId,
                        copilotOrganizationId: candidates[0].organizationId ?? null,
                        userId: resolvedModelAccess?.billableUserId ?? userId,
                        modelAccess: resolvedModelAccess,
                        originExecutionId: normalizeOptionalString(scope.executionId),
                        xpertId,
                        copilotId: candidates[0].id,
                        providerScopeId: connection.id,
                        provider: providerName
                    },
                    report,
                    pricingSnapshot
                )
            }
        }
    }

    async wrapWorkflowNodeExecution<T>(
        run: (execution: Partial<IXpertAgentExecution>) => Promise<AgentMiddlewareWrapWorkflowNodeExecutionResult<T>>,
        params: AgentMiddlewareWrapWorkflowNodeExecutionParams
    ): Promise<T> {
        return wrapAgentExecution(run, {
            ...params,
            commandBus: this.commandBus,
            queryBus: this.queryBus
        })()
    }

    async emitMiddlewareEvent(event: AgentMiddlewareEvent): Promise<void> {
        const timestamp = new Date().toISOString()
        const {
            agentKey: _agentKey,
            type: _type,
            created_date,
            end_date,
            status,
            ...safeEvent
        } = event as AgentMiddlewareEvent & { agentKey?: unknown }

        await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
            ...safeEvent,
            type: 'middleware_event',
            ...(status ? { status } : {}),
            created_date: created_date ?? timestamp,
            ...(end_date ? { end_date } : status && status !== 'running' ? { end_date: timestamp } : {})
        })
    }
}

function resolveUsageModelType(context: ModelUsagePricingContext): AiModelTypeEnum {
    switch (context.operation) {
        case AiModelTypeEnum.LLM:
        case AiModelTypeEnum.TEXT_EMBEDDING:
        case AiModelTypeEnum.RERANK:
        case AiModelTypeEnum.SPEECH2TEXT:
        case AiModelTypeEnum.MODERATION:
        case AiModelTypeEnum.TTS:
        case AiModelTypeEnum.IMAGE:
        case AiModelTypeEnum.TEXT2IMG:
        case AiModelTypeEnum.VIDEO:
            return context.operation
        default:
            if (context.modality === 'image') return AiModelTypeEnum.IMAGE
            if (context.modality === 'video') return AiModelTypeEnum.VIDEO
            throw new Error(`Model usage operation '${context.operation}' must identify its model type.`)
    }
}
