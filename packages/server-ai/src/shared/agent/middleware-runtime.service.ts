import { randomUUID } from 'crypto'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
    AiModelTypeEnum,
    AiProviderRole,
    ChatMessageEventTypeEnum,
    ICopilotModel,
    IChatConversation,
    IStorageFile,
    IModelAccessResolution,
    IXpertAgentExecution,
    TChatConversationStatus,
    TChatRequest,
    XpertAgentExecutionStatusEnum,
    mapTranslationLanguage
} from '@xpert-ai/contracts'
import { omit } from '@xpert-ai/server-common'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Observable } from 'rxjs'
import {
    AIModelProviderNotFoundException,
    AgentMiddlewareAssistantTaskFile,
    AgentMiddlewareAssistantTaskCancelResult,
    AgentMiddlewareAssistantTaskInput,
    AgentMiddlewareAssistantTaskResult,
    AgentMiddlewareAssistantTaskStatus,
    AgentMiddlewareAssistantTaskStatusInput,
    AgentMiddlewareFileReference,
    AgentMiddlewareResolvedFile,
    AgentMiddlewareCreateModelClientOptions,
    AgentMiddlewareRuntimeScope,
    KnowledgebaseDeleteChunksInput,
    KnowledgebaseDeleteChunksResult,
    KnowledgebaseCreateDocumentsInput,
    KnowledgebaseCreateDocumentsResult,
    KnowledgebaseCreateFolderInput,
    KnowledgebaseCreateFolderResult,
    KnowledgebaseDeleteDocumentsInput,
    KnowledgebaseDeleteDocumentsResult,
    KnowledgebaseDocumentStatusInput,
    KnowledgebaseDocumentStatusResult,
    KnowledgebaseImportArchiveInput,
    KnowledgebaseImportArchiveResult,
    KnowledgebaseListDocumentsInput,
    KnowledgebaseListDocumentsResult,
    KnowledgebaseMoveDocumentInput,
    KnowledgebaseMoveDocumentResult,
    KnowledgebaseListInput,
    KnowledgebaseListItem,
    KnowledgebaseSearchInput,
    KnowledgebaseSearchResult,
    KnowledgebaseStartProcessingInput,
    KnowledgebaseUploadFileInput,
    KnowledgebaseUploadedFile,
    KnowledgebaseWriteChunkInput,
    KnowledgebaseWriteChunkResult,
    AgentMiddlewareEvent,
    AgentMiddlewareModelClient,
    AgentMiddlewareModelProviderConnection,
    AgentMiddlewareRuntimeApi,
    TLLMUsage,
    AgentMiddlewareWrapWorkflowNodeExecutionParams,
    AgentMiddlewareWrapWorkflowNodeExecutionResult,
    ActorTokenRequest,
    ActorTokenResult,
    ActorTokenRuntimeCapability,
    AssistantTaskRuntimeCapability,
    ConnectorRuntimeCapability,
    CollaborationRuntimeCapability,
    DefaultRuntimeCapabilityRegistry,
    FileRuntimeCapability,
    KnowledgebaseDocumentsRuntimeCapability,
    KnowledgeDocumentVisualAssetsRuntimeCapability,
    KnowledgebaseRuntimeCapability,
    KnowledgebaseProvisioningRuntimeCapability,
    KnowledgebaseEnsureInput,
    KnowledgebaseEnsureResult,
    KnowledgebaseConnectAgentInput,
    KnowledgebaseConnectAgentResult,
    RequestContext,
    ArtifactsRuntimeCapability,
    CancelConversationCommand,
    WorkspaceFilesRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import { FileStorage, GetStorageFileQuery, OutboundActorTokenProvider } from '@xpert-ai/server-core'
import { I18nService } from 'nestjs-i18n'
import { t } from 'i18next'
import { ModelProvider } from '../../ai-model/ai-provider'
import { AIModelGetProviderQuery } from '../../ai-model/queries/get-provider.query'
import { GetCopilotProviderModelQuery } from '../../copilot-provider/queries/get-model.query'
import { CopilotCheckLimitCommand } from '../../copilot-user/commands/check-limit.command'
import { CopilotTokenRecordCommand } from '../../copilot-user/commands/token-record.command'
import { CopilotModelNotFoundException, ExceedingLimitException } from '../../core/errors'
import { CopilotGetOneQuery } from '../../copilot/queries/get-one.query'
import { CopilotService } from '../../copilot/copilot.service'
import { CopilotUsageService } from '../../copilot-usage'
import { ensureCopilotModelContextSize } from '../../copilot-model/utils/context-size'
import {
    CreateKnowledgebaseFolderCommand,
    CreateKnowledgebaseDocumentsCommand,
    DeleteAgentKnowledgeChunksCommand,
    DeleteKnowledgebaseDocumentsCommand,
    GetKnowledgebaseDocumentStatusCommand,
    ImportKnowledgebaseArchiveCommand,
    ListKnowledgebaseDocumentsCommand,
    MoveKnowledgebaseDocumentCommand,
    StartKnowledgebaseDocumentsProcessingCommand,
    UploadKnowledgebaseDocumentFileCommand,
    WriteAgentKnowledgeChunkCommand
} from '../../knowledgebase/commands'
import { EnsureKnowledgebasesCommand } from '../../knowledgebase/commands'
import { KnowledgeSearchQuery, ListWorkspaceKnowledgebasesQuery } from '../../knowledgebase/queries'
import { GetChatConversationQuery } from '../../chat-conversation/queries/conversation-get.query'
import { ChatConversationUpsertCommand } from '../../chat-conversation/commands/upsert.command'
import { FileAsset, GetFileAssetQuery } from '../../file-understanding'
import { XpertChatCommand } from '../../xpert/commands/chat.command'
import { applicationMetrics } from '../../metrics'
import { XpertAgentExecutionUpsertCommand } from '../../xpert-agent-execution/commands/upsert.command'
import { XpertAgentExecutionOneQuery } from '../../xpert-agent-execution/queries/get-one.query'
import { ConnectAgentKnowledgebasesCommand } from '../../xpert-agent/commands'
import { ConnectorService } from '../../connector/connector.service'
import { ArtifactsService } from '../../artifacts/artifacts.service'
import { CollaborationService } from '../../collaboration/collaboration.service'
import { WorkspaceFilesRuntimeCapabilityService } from '../runtime/workspace-files-runtime-capability.service'
import {
    KNOWLEDGE_DOCUMENT_VISUAL_ASSETS_RUNTIME,
    type KnowledgeDocumentVisualAssetsRuntimeFactory
} from '../../knowledge-document/visual-assets-runtime.token'
import { ModuleRef } from '@nestjs/core'
import { wrapAgentExecution } from './execution'

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
export class AgentMiddlewareRuntimeService {
    readonly #logger = new Logger(AgentMiddlewareRuntimeService.name)
    readonly api: AgentMiddlewareRuntimeApi

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

        const modelProvider = await this.queryBus.execute<AIModelGetProviderQuery, ModelProvider>(
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
                                totalPrice: input.usage.totalPrice,
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

    async getModelProvider(
        provider: string,
        scope: AgentMiddlewareRuntimeScope = {}
    ): Promise<AgentMiddlewareModelProviderConnection> {
        const providerName = normalizeOptionalString(provider)
        const tenantId = normalizeOptionalString(scope.tenantId) ?? RequestContext.currentTenantId()
        const organizationId = normalizeOptionalString(scope.organizationId) ?? RequestContext.getOrganizationId()
        const providerScopeId = normalizeOptionalString(scope.providerScopeId)
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

        const modelProvider = await this.queryBus.execute<AIModelGetProviderQuery, ModelProvider>(
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
            const modelType = context.modality === 'image' ? AiModelTypeEnum.IMAGE : AiModelTypeEnum.VIDEO
            return modelProvider
                .getModelManager(modelType)
                .getUsagePricingSnapshot(context.model, connection.credentials, context)
        }

        return {
            providerScopeId: connection.id,
            copilotId: candidates[0].id,
            organizationId: candidates[0].organizationId ?? null,
            provider: providerName,
            baseURL: modelProvider.getBaseUrl(connection.credentials),
            authorization: modelProvider.getAuthorization(connection.credentials),
            resolvePricingSnapshot,
            reportUsage: async (report) => {
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
                        userId: normalizeOptionalString(scope.userId) ?? RequestContext.currentUserId(),
                        originExecutionId: normalizeOptionalString(scope.executionId),
                        xpertId: normalizeOptionalString(scope.xpertId),
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

    async listKnowledgebases(input: KnowledgebaseListInput = {}): Promise<KnowledgebaseListItem[]> {
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

    async ensureKnowledgebases(input: KnowledgebaseEnsureInput): Promise<KnowledgebaseEnsureResult> {
        return this.commandBus.execute(new EnsureKnowledgebasesCommand(input))
    }

    async connectAgentKnowledgebases(input: KnowledgebaseConnectAgentInput): Promise<KnowledgebaseConnectAgentResult> {
        return this.commandBus.execute(new ConnectAgentKnowledgebasesCommand(input))
    }

    async searchKnowledgebase(input: KnowledgebaseSearchInput): Promise<KnowledgebaseSearchResult> {
        return this.queryBus.execute(
            new KnowledgeSearchQuery({
                tenantId: input.tenantId ?? RequestContext.currentTenantId(),
                organizationId: input.organizationId ?? RequestContext.getOrganizationId(),
                knowledgebases: input.knowledgebaseIds,
                query: input.query,
                k: input.k,
                score: input.score,
                filters: { request: input.filter },
                retrieval: input.retrieval,
                source: input.source,
                id: input.requestId
            })
        )
    }

    async writeKnowledgeChunk(input: KnowledgebaseWriteChunkInput): Promise<KnowledgebaseWriteChunkResult> {
        return this.commandBus.execute(new WriteAgentKnowledgeChunkCommand(input))
    }

    async deleteKnowledgeChunks(input: KnowledgebaseDeleteChunksInput): Promise<KnowledgebaseDeleteChunksResult> {
        return this.commandBus.execute(new DeleteAgentKnowledgeChunksCommand(input))
    }

    async uploadKnowledgebaseDocumentFile(input: KnowledgebaseUploadFileInput): Promise<KnowledgebaseUploadedFile> {
        return this.commandBus.execute(new UploadKnowledgebaseDocumentFileCommand(input))
    }

    async listKnowledgebaseDocuments(
        input: KnowledgebaseListDocumentsInput
    ): Promise<KnowledgebaseListDocumentsResult> {
        return this.commandBus.execute(new ListKnowledgebaseDocumentsCommand(input))
    }

    async createKnowledgebaseFolder(input: KnowledgebaseCreateFolderInput): Promise<KnowledgebaseCreateFolderResult> {
        return this.commandBus.execute(new CreateKnowledgebaseFolderCommand(input))
    }

    async moveKnowledgebaseDocument(input: KnowledgebaseMoveDocumentInput): Promise<KnowledgebaseMoveDocumentResult> {
        return this.commandBus.execute(new MoveKnowledgebaseDocumentCommand(input))
    }

    async importKnowledgebaseArchive(
        input: KnowledgebaseImportArchiveInput
    ): Promise<KnowledgebaseImportArchiveResult> {
        return this.commandBus.execute(new ImportKnowledgebaseArchiveCommand(input))
    }

    async createKnowledgebaseDocuments(
        input: KnowledgebaseCreateDocumentsInput
    ): Promise<KnowledgebaseCreateDocumentsResult> {
        return this.commandBus.execute(new CreateKnowledgebaseDocumentsCommand(input))
    }

    async startKnowledgebaseDocumentsProcessing(
        input: KnowledgebaseStartProcessingInput
    ): Promise<KnowledgebaseDocumentStatusResult> {
        return this.commandBus.execute(new StartKnowledgebaseDocumentsProcessingCommand(input))
    }

    async getKnowledgebaseDocumentStatus(
        input: KnowledgebaseDocumentStatusInput
    ): Promise<KnowledgebaseDocumentStatusResult> {
        return this.commandBus.execute(new GetKnowledgebaseDocumentStatusCommand(input))
    }

    async deleteKnowledgebaseDocuments(
        input: KnowledgebaseDeleteDocumentsInput
    ): Promise<KnowledgebaseDeleteDocumentsResult> {
        return this.commandBus.execute(new DeleteKnowledgebaseDocumentsCommand(input))
    }

    async resolveFile(input: AgentMiddlewareFileReference): Promise<AgentMiddlewareResolvedFile | null> {
        const directUrl =
            normalizeOptionalString(input.previewUrl) ??
            normalizeOptionalString(input.fileUrl) ??
            normalizeOptionalString(input.url)
        const fileAssetId =
            normalizeOptionalString(input.fileAssetId) ??
            normalizeOptionalString(input.fileId) ??
            (!normalizeOptionalString(input.storageFileId) ? normalizeOptionalString(input.id) : undefined)
        let storageFileId = normalizeOptionalString(input.storageFileId)
        let fileAsset: FileAsset | null = null
        let storageFile: IStorageFile | null = null

        if (!directUrl && fileAssetId) {
            fileAsset = await this.queryBus.execute<GetFileAssetQuery, FileAsset | null>(
                new GetFileAssetQuery(fileAssetId)
            )
            storageFileId = storageFileId ?? normalizeOptionalString(fileAsset?.storageFileId)
        }

        if (!directUrl && storageFileId) {
            const storageFiles = await this.queryBus.execute<GetStorageFileQuery, IStorageFile[]>(
                new GetStorageFileQuery([storageFileId])
            )
            storageFile = storageFiles[0] ?? null
        }

        const url = directUrl ?? this.resolveStorageFileUrl(storageFile)
        if (!url) {
            return null
        }

        const name =
            normalizeOptionalString(input.name) ??
            normalizeOptionalString(input.originalName) ??
            normalizeOptionalString(fileAsset?.originalName) ??
            normalizeOptionalString(fileAsset?.fileName) ??
            normalizeOptionalString(storageFile?.originalName) ??
            'source-document'
        const mimeType =
            normalizeOptionalString(input.mimeType) ??
            normalizeOptionalString(input.mimetype) ??
            normalizeOptionalString(fileAsset?.mimeType) ??
            normalizeOptionalString(storageFile?.mimetype)
        const size =
            typeof input.size === 'number'
                ? input.size
                : typeof fileAsset?.size === 'number'
                  ? fileAsset.size
                  : typeof storageFile?.size === 'number'
                    ? storageFile.size
                    : undefined

        return {
            id: fileAssetId ?? storageFileId ?? url,
            ...(fileAssetId ? { fileId: fileAssetId, fileAssetId } : {}),
            ...(storageFileId ? { storageFileId } : {}),
            name,
            ...(mimeType ? { mimeType } : {}),
            ...(typeof size === 'number' ? { size } : {}),
            url,
            previewUrl: url
        }
    }

    async getAssistantTaskStatus(
        input: AgentMiddlewareAssistantTaskStatusInput
    ): Promise<AgentMiddlewareAssistantTaskResult | null> {
        const execution = await this.findAssistantTaskExecution(input)
        const conversation = await this.findAssistantTaskConversation(input)
        if (!execution && !conversation) {
            return null
        }

        return {
            status: execution
                ? mapExecutionStatusToTaskStatus(execution.status)
                : mapConversationStatusToTaskStatus(conversation?.status),
            taskId: normalizeOptionalString(input.taskId),
            executionId: execution?.id ?? normalizeOptionalString(input.executionId),
            conversationId: conversation?.id ?? normalizeOptionalString(input.conversationId),
            threadId: execution?.threadId ?? conversation?.threadId ?? normalizeOptionalString(input.threadId),
            errorMessage: execution?.error ?? conversation?.error
        }
    }

    async cancelAssistantTask(
        input: AgentMiddlewareAssistantTaskStatusInput
    ): Promise<AgentMiddlewareAssistantTaskCancelResult> {
        const result = await this.commandBus.execute<
            CancelConversationCommand,
            { canceledExecutionIds?: string[] } | undefined
        >(
            new CancelConversationCommand({
                conversationId: normalizeOptionalString(input.conversationId),
                threadId: normalizeOptionalString(input.threadId),
                executionId: normalizeOptionalString(input.executionId)
            })
        )

        return {
            canceledExecutionIds: result?.canceledExecutionIds ?? []
        }
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

        const requestedTaskId = normalizeOptionalString(input.taskId)
        const taskId = requestedTaskId ?? randomUUID()
        const conversationId = normalizeOptionalString(input.conversationId) ?? randomUUID()
        const executionId = normalizeOptionalString(input.executionId) ?? randomUUID()
        const conversation = await this.commandBus.execute<ChatConversationUpsertCommand, IChatConversation>(
            new ChatConversationUpsertCommand({
                id: conversationId,
                createdById: RequestContext.currentUserId(),
                status: 'busy',
                xpertId,
                from: 'job',
                options: {
                    parameters: {
                        input: prompt
                    }
                },
                ...(requestedTaskId ? { taskId: requestedTaskId } : {})
            })
        )
        const execution = await this.commandBus.execute<XpertAgentExecutionUpsertCommand, IXpertAgentExecution>(
            new XpertAgentExecutionUpsertCommand({
                id: executionId,
                xpertId,
                agentKey: normalizeOptionalString(input.agentKey),
                status: XpertAgentExecutionStatusEnum.RUNNING,
                threadId: conversation.threadId,
                metadata: {
                    from: 'job'
                }
            })
        )
        const request: TChatRequest = {
            action: 'send',
            conversationId: conversation.id,
            ...(normalizeOptionalString(input.projectId)
                ? { projectId: normalizeOptionalString(input.projectId) }
                : {}),
            message: {
                clientMessageId: normalizeOptionalString(input.clientMessageId) ?? `assistant-task:${taskId}`,
                input: {
                    ...(input.humanInput ?? {}),
                    input: prompt,
                    files: normalizeTaskFiles(input.files)
                }
            }
        }

        const stream = await this.commandBus.execute<XpertChatCommand, Observable<MessageEvent>>(
            new XpertChatCommand(request, {
                xpertId,
                from: 'job',
                ...(requestedTaskId ? { taskId: requestedTaskId } : {}),
                projectId: normalizeOptionalString(input.projectId) ?? undefined,
                context: input.context,
                execution: { id: execution.id },
                streamPersistence: {
                    transport: 'redis-stream',
                    threadId: conversation.threadId,
                    runId: execution.id
                }
            })
        )

        stream.subscribe({
            error: (error) =>
                this.#logger.error(
                    `Assistant task stream failed (${error instanceof Error ? error.name : 'UnknownError'})`
                ),
            complete: () => undefined
        })

        return {
            status: 'running',
            taskId,
            conversationId: conversation.id,
            threadId: conversation.threadId,
            executionId: execution.id
        }
    }

    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly i18nService: I18nService,
        private readonly connectors: ConnectorService,
        private readonly workspaceFiles: WorkspaceFilesRuntimeCapabilityService,
        private readonly artifacts: ArtifactsService,
        private readonly collaboration: CollaborationService,
        private readonly copilotService: CopilotService,
        private readonly copilotUsage: CopilotUsageService,
        private readonly moduleRef: ModuleRef,
        @Optional()
        private readonly outboundActorTokenProvider?: OutboundActorTokenProvider
    ) {
        this.api = this.createScopedApi()
    }

    /**
     * Build an Agent middleware runtime API for a specific invocation scope.
     *
     * The workspace-files capability is scoped here so plugin tools can receive
     * simple sandbox paths while server-side reads still honor the current
     * project/Xpert workspace boundary.
     */
    createScopedApi(scope: AgentMiddlewareRuntimeScope = {}): AgentMiddlewareRuntimeApi {
        const workspaceFilesApi = hasRuntimeWorkspaceScope(scope)
            ? this.workspaceFiles.createScopedApi(scope)
            : this.workspaceFiles.api
        const artifactsApi = this.artifacts.createScopedApi({
            ...scope,
            organizationId: scope.organizationId ?? RequestContext.getOrganizationId()
        })
        const collaborationApi = this.collaboration.createScopedApi(scope)
        const actorTokenApi = this.createActorTokenApi(scope)
        const visualAssetsApi = this.visualAssetsRuntime(scope)
        const capabilities = new DefaultRuntimeCapabilityRegistry([
            [ActorTokenRuntimeCapability, actorTokenApi],
            [
                KnowledgebaseRuntimeCapability,
                {
                    list: (input) => this.listKnowledgebases(input),
                    search: (input) => this.searchKnowledgebase(input),
                    writeChunk: (input) => this.writeKnowledgeChunk(input),
                    deleteChunks: (input) => this.deleteKnowledgeChunks(input)
                }
            ],
            [
                KnowledgebaseDocumentsRuntimeCapability,
                {
                    listDocuments: (input) => this.listKnowledgebaseDocuments(input),
                    createFolder: (input) => this.createKnowledgebaseFolder(input),
                    moveDocument: (input) => this.moveKnowledgebaseDocument(input),
                    uploadFile: (input) => this.uploadKnowledgebaseDocumentFile(input),
                    importArchive: (input) => this.importKnowledgebaseArchive(input),
                    createDocuments: (input) => this.createKnowledgebaseDocuments(input),
                    startProcessing: (input) => this.startKnowledgebaseDocumentsProcessing(input),
                    getDocumentStatus: (input) => this.getKnowledgebaseDocumentStatus(input),
                    deleteDocuments: (input) => this.deleteKnowledgebaseDocuments(input)
                }
            ],
            [
                KnowledgebaseProvisioningRuntimeCapability,
                {
                    ensure: (input) => this.ensureKnowledgebases(input),
                    connectAgent: (input) => this.connectAgentKnowledgebases(input)
                }
            ],
            [
                AssistantTaskRuntimeCapability,
                {
                    startTask: (input) => this.startAssistantTask(input),
                    getTaskStatus: (input) => this.getAssistantTaskStatus(input),
                    cancelTask: (input) => this.cancelAssistantTask(input)
                }
            ],
            [
                FileRuntimeCapability,
                {
                    resolveFile: (input) => this.resolveFile(input)
                }
            ],
            [
                ConnectorRuntimeCapability,
                {
                    getConnector: (input) => this.connectors.getRuntimeConnector(input),
                    getConnectorCredential: (input) => this.connectors.getRuntimeConnectorCredential(input)
                }
            ],
            [ArtifactsRuntimeCapability, artifactsApi],
            [CollaborationRuntimeCapability, collaborationApi],
            [WorkspaceFilesRuntimeCapability, workspaceFilesApi],
            [KnowledgeDocumentVisualAssetsRuntimeCapability, visualAssetsApi]
        ])

        return {
            createModelClient: (copilotModel, options) => this.createModelClient(copilotModel, options, scope, true),
            getModelProvider: (provider) => this.getModelProvider(provider, scope),
            wrapWorkflowNodeExecution: (...args) => this.wrapWorkflowNodeExecution(...args),
            emitMiddlewareEvent: (...args) => this.emitMiddlewareEvent(...args),
            capabilities
        } satisfies AgentMiddlewareRuntimeApi
    }

    private visualAssetsRuntime(scope: AgentMiddlewareRuntimeScope) {
        return this.moduleRef
            .get<KnowledgeDocumentVisualAssetsRuntimeFactory>(KNOWLEDGE_DOCUMENT_VISUAL_ASSETS_RUNTIME, {
                strict: false
            })
            .createScopedApi(scope)
    }

    private createActorTokenApi(scope: AgentMiddlewareRuntimeScope) {
        let cached: {
            cacheKey: string
            expiresAtMs: number
            result: ActorTokenResult
        } | null = null
        const tenantId = scope.tenantId ?? RequestContext.currentTenantId()
        const organizationId = scope.organizationId ?? RequestContext.getOrganizationId()
        const user =
            RequestContext.currentUser() ??
            (scope.userId && tenantId
                ? ({
                      id: scope.userId,
                      tenantId
                  } as ReturnType<typeof RequestContext.currentUser>)
                : null)
        const defaultAct = pruneUndefined({
            sub: 'xpert_agent',
            workspace_id: normalizeOptionalString(scope.workspaceId),
            project_id: normalizeOptionalString(scope.projectId),
            xpert_id: normalizeOptionalString(scope.xpertId),
            xpert_name: normalizeOptionalString(scope.xpertName),
            conversation_id: normalizeOptionalString(scope.conversationId),
            agent_key: normalizeOptionalString(scope.agentKey),
            execution_id: normalizeOptionalString(scope.executionId)
        })

        return {
            getToken: async (input: ActorTokenRequest = {}) => {
                if (!this.outboundActorTokenProvider) {
                    throw new Error('Outbound actor token provider is not configured')
                }

                const cacheKey = JSON.stringify({
                    audience: input.audience ?? null,
                    ttlSeconds: input.ttlSeconds ?? null,
                    act: input.act ?? null
                })
                if (cached?.cacheKey === cacheKey && cached.expiresAtMs - Date.now() > 30_000) {
                    return cached.result
                }

                const result = this.outboundActorTokenProvider.mint({
                    user,
                    tenantId,
                    organizationId,
                    audience: input.audience,
                    ttlSeconds: input.ttlSeconds,
                    act: {
                        ...defaultAct,
                        ...(input.act ?? {})
                    }
                })

                cached = {
                    cacheKey,
                    expiresAtMs: Date.parse(result.expiresAt),
                    result
                }
                return result
            }
        }
    }

    private resolveStorageFileUrl(storageFile: IStorageFile | null) {
        if (!storageFile) {
            return undefined
        }

        const directUrl = normalizeOptionalString(storageFile.fileUrl) ?? normalizeOptionalString(storageFile.url)
        if (directUrl) {
            return directUrl
        }

        const file = normalizeOptionalString(storageFile.file)
        if (!file) {
            return undefined
        }

        return new FileStorage().getProvider(storageFile.storageProvider)?.url(file)
    }

    private async findAssistantTaskConversation(
        input: AgentMiddlewareAssistantTaskStatusInput
    ): Promise<IChatConversation | null> {
        const conversationId = normalizeOptionalString(input.conversationId)
        const threadId = normalizeOptionalString(input.threadId)
        const taskId = normalizeOptionalString(input.taskId)
        const xpertId = normalizeOptionalString(input.xpertId)
        const conditions = conversationId
            ? { id: conversationId, ...(xpertId ? { xpertId } : {}) }
            : threadId
              ? { threadId, ...(xpertId ? { xpertId } : {}) }
              : taskId
                ? { taskId, ...(xpertId ? { xpertId } : {}) }
                : null

        if (!conditions) {
            return null
        }

        try {
            return await this.queryBus.execute<GetChatConversationQuery, IChatConversation>(
                new GetChatConversationQuery(conditions)
            )
        } catch (error) {
            this.#logger.debug(
                `Assistant task status conversation was not found: ${
                    error instanceof Error ? error.message : String(error)
                }`
            )
            return null
        }
    }

    private async findAssistantTaskExecution(
        input: AgentMiddlewareAssistantTaskStatusInput
    ): Promise<IXpertAgentExecution | null> {
        const executionId = normalizeOptionalString(input.executionId)
        if (!executionId) {
            return null
        }

        try {
            return await this.queryBus.execute<XpertAgentExecutionOneQuery, IXpertAgentExecution>(
                new XpertAgentExecutionOneQuery(executionId)
            )
        } catch (error) {
            this.#logger.debug(
                `Assistant task execution was not found: ${error instanceof Error ? error.message : String(error)}`
            )
            return null
        }
    }
}

function normalizeOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)) as T
}

/** Check whether a middleware runtime needs a per-invocation workspace facade. */
function hasRuntimeWorkspaceScope(scope: AgentMiddlewareRuntimeScope) {
    return Boolean(
        normalizeOptionalString(scope.tenantId) ||
        normalizeOptionalString(scope.userId) ||
        normalizeOptionalString(scope.projectId) ||
        normalizeOptionalString(scope.xpertId) ||
        normalizeOptionalString(scope.workspaceRoot) ||
        normalizeOptionalString(scope.workspacePath)
    )
}

function mapConversationStatusToTaskStatus(
    status: TChatConversationStatus | undefined
): AgentMiddlewareAssistantTaskStatus {
    switch (status) {
        case 'busy':
            return 'running'
        case 'error':
            return 'failed'
        case 'interrupted':
            return 'interrupted'
        case 'idle':
            return 'succeeded'
        default:
            return 'unknown'
    }
}

function mapExecutionStatusToTaskStatus(
    status: XpertAgentExecutionStatusEnum | undefined
): AgentMiddlewareAssistantTaskStatus {
    switch (status) {
        case XpertAgentExecutionStatusEnum.PENDING:
            return 'queued'
        case XpertAgentExecutionStatusEnum.RUNNING:
            return 'running'
        case XpertAgentExecutionStatusEnum.SUCCESS:
            return 'succeeded'
        case XpertAgentExecutionStatusEnum.INTERRUPTED:
            return 'interrupted'
        case XpertAgentExecutionStatusEnum.ERROR:
        case XpertAgentExecutionStatusEnum.TIMEOUT:
            return 'failed'
        default:
            return 'unknown'
    }
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
