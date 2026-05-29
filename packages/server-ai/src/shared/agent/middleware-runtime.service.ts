import { randomUUID } from 'crypto'
import { ICopilotModel, IXpertAgentExecution, TChatRequest, mapTranslationLanguage } from '@xpert-ai/contracts'
import { omit } from '@xpert-ai/server-common'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Observable } from 'rxjs'
import {
    AIModelProviderNotFoundException,
    AgentMiddlewareAssistantTaskFile,
    AgentMiddlewareAssistantTaskInput,
    AgentMiddlewareAssistantTaskResult,
    AgentMiddlewareCreateModelClientOptions,
    AgentMiddlewareKnowledgebaseDocument,
    AgentMiddlewareKnowledgebaseListInput,
    AgentMiddlewareKnowledgebaseListItem,
    AgentMiddlewareKnowledgebaseSearchInput,
    AgentMiddlewareKnowledgebaseWriteChunkInput,
    AgentMiddlewareKnowledgebaseWriteChunkResult,
    AgentMiddlewareModelClient,
    AgentMiddlewareRuntimeApi,
    AgentMiddlewareWrapWorkflowNodeExecutionParams,
    AgentMiddlewareWrapWorkflowNodeExecutionResult,
    AssistantTaskRuntimeCapability,
    DefaultAgentMiddlewareRuntimeCapabilityRegistry,
    KnowledgebaseRuntimeCapability,
    RequestContext
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
import { WriteAgentKnowledgeChunkCommand } from '../../knowledgebase/commands'
import { KnowledgeSearchQuery, ListWorkspaceKnowledgebasesQuery } from '../../knowledgebase/queries'
import { XpertChatCommand } from '../../xpert/commands/chat.command'
import { wrapAgentExecution } from './execution'

@Injectable()
export class AgentMiddlewareRuntimeService {
    readonly #logger = new Logger(AgentMiddlewareRuntimeService.name)
    private readonly capabilities = new DefaultAgentMiddlewareRuntimeCapabilityRegistry([
        [
            KnowledgebaseRuntimeCapability,
            {
                list: (input) => this.listKnowledgebases(input),
                search: (input) => this.searchKnowledgebase(input),
                writeChunk: (input) => this.writeKnowledgeChunk(input)
            }
        ],
        [
            AssistantTaskRuntimeCapability,
            {
                startTask: (input) => this.startAssistantTask(input)
            }
        ]
    ])

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
                    lang: mapTranslationLanguage(RequestContext.getLanguageCode())
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
                model: modelName
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
                copilot
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
                                currency: input.usage?.currency
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

    async listKnowledgebases(
        input: AgentMiddlewareKnowledgebaseListInput = {}
    ): Promise<AgentMiddlewareKnowledgebaseListItem[]> {
        const workspaceId = normalizeOptionalString(input.workspaceId)
        if (!workspaceId) {
            return []
        }

        return this.queryBus.execute(
            new ListWorkspaceKnowledgebasesQuery({
                workspaceId,
                published: input.published,
                limit: input.limit
            })
        )
    }

    async searchKnowledgebase(
        input: AgentMiddlewareKnowledgebaseSearchInput
    ): Promise<AgentMiddlewareKnowledgebaseDocument[]> {
        return this.queryBus.execute(
            new KnowledgeSearchQuery({
                tenantId: input.tenantId ?? RequestContext.currentTenantId(),
                organizationId: input.organizationId ?? RequestContext.getOrganizationId(),
                knowledgebases: input.knowledgebaseIds,
                query: input.query,
                k: input.k,
                score: input.score,
                filter: input.filter,
                retrieval: input.retrieval,
                source: input.source,
                id: input.requestId
            })
        )
    }

    async writeKnowledgeChunk(
        input: AgentMiddlewareKnowledgebaseWriteChunkInput
    ): Promise<AgentMiddlewareKnowledgebaseWriteChunkResult> {
        return this.commandBus.execute(new WriteAgentKnowledgeChunkCommand(input))
    }

    async startAssistantTask(input: AgentMiddlewareAssistantTaskInput): Promise<AgentMiddlewareAssistantTaskResult> {
        const xpertId = normalizeOptionalString(input.xpertId)
        const prompt = normalizeOptionalString(input.prompt)
        if (!xpertId) {
            throw new Error('xpertId is required to start an assistant task')
        }
        if (!prompt) {
            throw new Error('prompt is required to start an assistant task')
        }

        const taskId = normalizeOptionalString(input.taskId) ?? randomUUID()
        const request: TChatRequest = {
            action: 'send',
            ...(normalizeOptionalString(input.conversationId)
                ? { conversationId: normalizeOptionalString(input.conversationId) }
                : {}),
            ...(normalizeOptionalString(input.projectId)
                ? { projectId: normalizeOptionalString(input.projectId) }
                : {}),
            message: {
                clientMessageId: normalizeOptionalString(input.clientMessageId) ?? `assistant-task:${taskId}`,
                input: {
                    input: prompt,
                    files: normalizeTaskFiles(input.files)
                }
            }
        }

        const stream = await this.commandBus.execute<XpertChatCommand, Observable<MessageEvent>>(
            new XpertChatCommand(request, {
                xpertId,
                from: 'job',
                taskId,
                projectId: normalizeOptionalString(input.projectId) ?? undefined,
                context: input.context
            })
        )

        stream.subscribe({
            error: (error) => this.#logger.error(error),
            complete: () => undefined
        })

        return {
            status: 'running',
            taskId,
            conversationId: normalizeOptionalString(input.conversationId)
        }
    }

    readonly api = {
        createModelClient: (...args) => this.createModelClient(...args),
        wrapWorkflowNodeExecution: (...args) => this.wrapWorkflowNodeExecution(...args),
        capabilities: this.capabilities
    } satisfies AgentMiddlewareRuntimeApi

    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly i18nService: I18nService
    ) {}
}

function normalizeOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeTaskFiles(files: AgentMiddlewareAssistantTaskFile[] | undefined) {
    if (!Array.isArray(files)) {
        return []
    }

    return files
        .map((file) => {
            const fileAssetId = normalizeOptionalString(file.fileAssetId) ?? normalizeOptionalString(file.fileId)
            const storageFileId = normalizeOptionalString(file.storageFileId)
            const originalName = normalizeOptionalString(file.originalName) ?? normalizeOptionalString(file.name)
            const mimeType = normalizeOptionalString(file.mimeType) ?? normalizeOptionalString(file.mimetype)
            if (fileAssetId) {
                return {
                    id: fileAssetId,
                    fileId: fileAssetId,
                    fileAssetId,
                    ...(storageFileId ? { storageFileId } : {}),
                    ...(originalName ? { originalName } : {}),
                    ...(mimeType ? { mimeType } : {}),
                    ...(typeof file.size === 'number' ? { size: file.size } : {})
                }
            }
            if (storageFileId) {
                return {
                    id: storageFileId,
                    ...(originalName ? { originalName } : {}),
                    ...(mimeType ? { mimetype: mimeType, mimeType } : {}),
                    ...(typeof file.size === 'number' ? { size: file.size } : {})
                }
            }
            return null
        })
        .filter(Boolean)
}
