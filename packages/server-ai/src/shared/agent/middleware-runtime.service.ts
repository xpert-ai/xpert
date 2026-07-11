import { randomUUID } from 'crypto'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
    ChatMessageEventTypeEnum,
    ICopilotModel,
    IChatConversation,
    IStorageFile,
    IXpertAgentExecution,
    TChatConversationStatus,
    TChatRequest,
    mapTranslationLanguage
} from '@xpert-ai/contracts'
import { omit } from '@xpert-ai/server-common'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Observable } from 'rxjs'
import {
    AIModelProviderNotFoundException,
    AgentMiddlewareAssistantTaskFile,
    AgentMiddlewareAssistantTaskInput,
    AgentMiddlewareAssistantTaskResult,
    AgentMiddlewareAssistantTaskStatus,
    AgentMiddlewareAssistantTaskStatusInput,
    AgentMiddlewareFileReference,
    AgentMiddlewareResolvedFile,
    AgentMiddlewareCreateModelClientOptions,
    KnowledgebaseDocument,
    KnowledgebaseDeleteChunksInput,
    KnowledgebaseDeleteChunksResult,
    KnowledgebaseCreateDocumentsInput,
    KnowledgebaseCreateDocumentsResult,
    KnowledgebaseDeleteDocumentsInput,
    KnowledgebaseDeleteDocumentsResult,
    KnowledgebaseDocumentStatusInput,
    KnowledgebaseDocumentStatusResult,
    KnowledgebaseImportArchiveInput,
    KnowledgebaseImportArchiveResult,
    KnowledgebaseListInput,
    KnowledgebaseListItem,
    KnowledgebaseSearchInput,
    KnowledgebaseStartProcessingInput,
    KnowledgebaseUploadFileInput,
    KnowledgebaseUploadedFile,
    KnowledgebaseWriteChunkInput,
    KnowledgebaseWriteChunkResult,
    AgentMiddlewareEvent,
    AgentMiddlewareModelClient,
    AgentMiddlewareRuntimeApi,
    AgentMiddlewareWrapWorkflowNodeExecutionParams,
    AgentMiddlewareWrapWorkflowNodeExecutionResult,
    AssistantTaskRuntimeCapability,
    ConnectorRuntimeCapability,
    DefaultRuntimeCapabilityRegistry,
    FileRuntimeCapability,
    KnowledgebaseDocumentsRuntimeCapability,
    KnowledgebaseRuntimeCapability,
    RequestContext,
    ArtifactsRuntimeCapability,
    WorkspaceFilesRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import { FileStorage, GetStorageFileQuery } from '@xpert-ai/server-core'
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
import {
    CreateKnowledgebaseDocumentsCommand,
    DeleteAgentKnowledgeChunksCommand,
    DeleteKnowledgebaseDocumentsCommand,
    GetKnowledgebaseDocumentStatusCommand,
    ImportKnowledgebaseArchiveCommand,
    StartKnowledgebaseDocumentsProcessingCommand,
    UploadKnowledgebaseDocumentFileCommand,
    WriteAgentKnowledgeChunkCommand
} from '../../knowledgebase/commands'
import { KnowledgeSearchQuery, ListWorkspaceKnowledgebasesQuery } from '../../knowledgebase/queries'
import { GetChatConversationQuery } from '../../chat-conversation/queries/conversation-get.query'
import { FileAsset, GetFileAssetQuery } from '../../file-understanding'
import { XpertChatCommand } from '../../xpert/commands/chat.command'
import { ConnectorService } from '../../connector/connector.service'
import { ArtifactsService } from '../../artifacts'
import { WorkspaceFilesRuntimeCapabilityService } from '../runtime/workspace-files-runtime-capability.service'
import { wrapAgentExecution } from './execution'

/**
 * Scope values captured from the current Agent invocation and bound into
 * runtime capabilities exposed to middleware plugins.
 */
export type AgentMiddlewareRuntimeScope = {
    tenantId?: string | null
    organizationId?: string | null
    userId?: string | null
    workspaceId?: string | null
    projectId?: string | null
    xpertId?: string | null
    workspaceRoot?: string | null
    workspacePath?: string | null
}

@Injectable()
export class AgentMiddlewareRuntimeService {
    readonly #logger = new Logger(AgentMiddlewareRuntimeService.name)
    readonly api: AgentMiddlewareRuntimeApi

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

    async searchKnowledgebase(input: KnowledgebaseSearchInput): Promise<KnowledgebaseDocument[]> {
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

    async writeKnowledgeChunk(input: KnowledgebaseWriteChunkInput): Promise<KnowledgebaseWriteChunkResult> {
        return this.commandBus.execute(new WriteAgentKnowledgeChunkCommand(input))
    }

    async deleteKnowledgeChunks(input: KnowledgebaseDeleteChunksInput): Promise<KnowledgebaseDeleteChunksResult> {
        return this.commandBus.execute(new DeleteAgentKnowledgeChunksCommand(input))
    }

    async uploadKnowledgebaseDocumentFile(input: KnowledgebaseUploadFileInput): Promise<KnowledgebaseUploadedFile> {
        return this.commandBus.execute(new UploadKnowledgebaseDocumentFileCommand(input))
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
        const conversation = await this.findAssistantTaskConversation(input)
        if (!conversation) {
            return null
        }

        return {
            status: mapConversationStatusToTaskStatus(conversation.status),
            taskId: normalizeOptionalString(input.taskId),
            executionId: normalizeOptionalString(input.executionId),
            conversationId: conversation.id,
            threadId: conversation.threadId,
            errorMessage: conversation.error
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

    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly i18nService: I18nService,
        private readonly connectors: ConnectorService,
        private readonly workspaceFiles: WorkspaceFilesRuntimeCapabilityService,
        private readonly artifacts: ArtifactsService
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
        const capabilities = new DefaultRuntimeCapabilityRegistry([
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
                    uploadFile: (input) => this.uploadKnowledgebaseDocumentFile(input),
                    importArchive: (input) => this.importKnowledgebaseArchive(input),
                    createDocuments: (input) => this.createKnowledgebaseDocuments(input),
                    startProcessing: (input) => this.startKnowledgebaseDocumentsProcessing(input),
                    getDocumentStatus: (input) => this.getKnowledgebaseDocumentStatus(input),
                    deleteDocuments: (input) => this.deleteKnowledgebaseDocuments(input)
                }
            ],
            [
                AssistantTaskRuntimeCapability,
                {
                    startTask: (input) => this.startAssistantTask(input),
                    getTaskStatus: (input) => this.getAssistantTaskStatus(input)
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
                    getConnector: (input) => this.connectors.getRuntimeConnector(input)
                }
            ],
            [ArtifactsRuntimeCapability, artifactsApi],
            [WorkspaceFilesRuntimeCapability, workspaceFilesApi]
        ])

        return {
            createModelClient: (...args) => this.createModelClient(...args),
            wrapWorkflowNodeExecution: (...args) => this.wrapWorkflowNodeExecution(...args),
            emitMiddlewareEvent: (...args) => this.emitMiddlewareEvent(...args),
            capabilities
        } satisfies AgentMiddlewareRuntimeApi
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
}

function normalizeOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
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
