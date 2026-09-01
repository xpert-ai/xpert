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
    IXpert,
    IWFNMiddleware,
    ModelUsagePricingContext,
    TChatConversationStatus,
    TChatRequest,
    XpertAgentExecutionStatusEnum,
    mapTranslationLanguage,
    figureOutXpert,
    getAgentMiddlewareNodes,
    normalizeMiddlewareProvider
} from '@xpert-ai/contracts'
import { omit } from '@xpert-ai/server-common'
import { ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Observable } from 'rxjs'
import {
    AIModelProviderNotFoundException,
    IAIModelProviderStrategy,
    AgentMiddlewareAssistantTaskFile,
    AgentMiddlewareExternalAssistantBinding,
    AgentMiddlewareListExternalAssistantBindingsInput,
    AgentMiddlewareListCorrelatedExecutionsInput,
    AgentMiddlewareCorrelatedExecution,
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
    KnowledgebaseReadImageInput,
    KnowledgebaseReadImageResult,
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
    ProjectProvisioningRuntimeCapability,
    ProjectEnsureInput,
    ProjectEnsureResult,
    KnowledgebaseEnsureInput,
    KnowledgebaseEnsureResult,
    KnowledgebaseConnectAgentInput,
    KnowledgebaseConnectAgentResult,
    RequestContext,
    ArtifactsRuntimeCapability,
    CancelConversationCommand,
    type WorkspaceFilesApi,
    WorkspaceFilesRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import { FileStorage, OutboundActorTokenProvider } from '@xpert-ai/server-core'
import { I18nService } from 'nestjs-i18n'
import { t } from 'i18next'
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
    ReadKnowledgebaseDocumentImageCommand,
    WriteAgentKnowledgeChunkCommand
} from '../../knowledgebase/commands'
import { EnsureKnowledgebasesCommand } from '../../knowledgebase/commands'
import { KnowledgeSearchQuery, ListWorkspaceKnowledgebasesQuery } from '../../knowledgebase/queries'
import { GetChatConversationQuery } from '../../chat-conversation/queries/conversation-get.query'
import { ChatConversationUpsertCommand } from '../../chat-conversation/commands/upsert.command'
import type { FileAsset } from '../../file-understanding/entities/file-asset.entity'
import type { FileAssetAuthority, FileAssetLocator } from '../../file-understanding/file-asset-access.service'
import { GetOwnedStorageFileQuery } from '../../file-understanding/queries/get-owned-storage-file.query'
import { ResolveAuthorizedFileAssetQuery } from '../../file-understanding/queries/resolve-authorized-file-asset.query'
import { XpertChatCommand } from '../../xpert/commands/chat.command'
import { FindXpertQuery } from '../../xpert/queries/get-one.query'
import { applicationMetrics } from '../../metrics'
import { XpertAgentExecutionUpsertCommand } from '../../xpert-agent-execution/commands/upsert.command'
import { XpertAgentExecutionOneQuery } from '../../xpert-agent-execution/queries/get-one.query'
import { FindAgentExecutionsQuery } from '../../xpert-agent-execution/queries/find.query'
import { ConnectAgentKnowledgebasesCommand } from '../../xpert-agent/commands'
import { EnsureXpertProjectCommand } from '../../xpert-project/commands'
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
import { SKILLS_MIDDLEWARE_NAME } from '../../skill-package/types'
import { ResolveRuntimeSkillPackagesQuery } from '../../skill-package/queries/resolve-runtime-skill-packages.query'
import {
    describeExternalAssistantBinding,
    directExternalAssistantIds,
    matchesExternalAssistantExpectation,
    safeExternalAssistantBinding,
    type ResolvedExternalAssistantBinding
} from '../../xpert/external-assistant-binding'
import { In } from 'typeorm'

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

    /** Expose idempotent Chat Project provisioning through the plugin runtime. */
    async ensureProject(input: ProjectEnsureInput): Promise<ProjectEnsureResult> {
        return this.commandBus.execute(new EnsureXpertProjectCommand(input))
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

    /** Delegates scoped image reads to the Knowledge command boundary; never exposes storage paths directly. */
    async readKnowledgebaseDocumentImage(input: KnowledgebaseReadImageInput): Promise<KnowledgebaseReadImageResult> {
        return this.commandBus.execute(new ReadKnowledgebaseDocumentImageCommand(input))
    }

    async resolveFile(
        input: AgentMiddlewareFileReference,
        scope: AgentMiddlewareRuntimeScope = {}
    ): Promise<AgentMiddlewareResolvedFile | null> {
        const directUrl =
            normalizeOptionalString(input.previewUrl) ??
            normalizeOptionalString(input.fileUrl) ??
            normalizeOptionalString(input.url)
        const explicitFileAssetId = normalizeOptionalString(input.fileAssetId) ?? normalizeOptionalString(input.fileId)
        const requestedStorageFileId = normalizeOptionalString(input.storageFileId)
        const bareId = normalizeOptionalString(input.id)
        const fileAssetId = explicitFileAssetId ?? (!requestedStorageFileId ? bareId : undefined)
        const legacyStorageFileId = requestedStorageFileId ?? (!explicitFileAssetId ? bareId : undefined)
        let storageFileId = requestedStorageFileId
        let fileAsset: FileAsset | null = null
        let storageFile: IStorageFile | null = null

        if (fileAssetId || storageFileId) {
            let locator: FileAssetLocator
            if (fileAssetId) {
                locator = { fileAssetId, ...(requestedStorageFileId ? { storageFileId: requestedStorageFileId } : {}) }
            } else {
                locator = { storageFileId }
            }
            try {
                const authorized = await this.queryBus.execute(
                    new ResolveAuthorizedFileAssetQuery({
                        locator,
                        authority: this.resolveFileAssetAuthority(scope),
                        operation: 'read'
                    })
                )
                fileAsset = authorized.asset
                storageFile = authorized.storageFile ?? null
                storageFileId = normalizeOptionalString(storageFile?.id)
            } catch (error) {
                if (!(error instanceof ForbiddenException) || explicitFileAssetId || !legacyStorageFileId) {
                    throw error
                }
                storageFile = await this.queryBus.execute(new GetOwnedStorageFileQuery(legacyStorageFileId))
                storageFileId = normalizeOptionalString(storageFile?.id)
            }
        }

        const url = storageFile ? this.resolveStorageFileUrl(storageFile) : directUrl
        if (!url) {
            return null
        }

        const name =
            normalizeOptionalString(fileAsset?.originalName) ??
            normalizeOptionalString(fileAsset?.fileName) ??
            normalizeOptionalString(storageFile?.originalName) ??
            normalizeOptionalString(input.name) ??
            normalizeOptionalString(input.originalName) ??
            'source-document'
        const mimeType =
            normalizeOptionalString(fileAsset?.mimeType) ??
            normalizeOptionalString(storageFile?.mimetype) ??
            normalizeOptionalString(input.mimeType) ??
            normalizeOptionalString(input.mimetype)
        const size =
            typeof fileAsset?.size === 'number'
                ? fileAsset.size
                : typeof storageFile?.size === 'number'
                  ? storageFile.size
                  : typeof input.size === 'number'
                    ? input.size
                    : undefined

        return {
            id: fileAsset?.id ?? storageFileId ?? url,
            ...(fileAsset ? { fileId: fileAsset.id, fileAssetId: fileAsset.id } : {}),
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

    /** Re-resolve the published graph so required-edge changes take effect without persisted instance IDs. */
    async listExternalAssistantBindings(
        input: AgentMiddlewareListExternalAssistantBindingsInput
    ): Promise<AgentMiddlewareExternalAssistantBinding[]> {
        return (await this.resolveExternalAssistantBindings(input.requesterXpertId, input.requesterAgentKey)).map(
            safeExternalAssistantBinding
        )
    }

    /** Limit reconciliation to requester-owned runs from currently bound external Assistants. */
    async listCorrelatedAssistantExecutions(
        input: AgentMiddlewareListCorrelatedExecutionsInput
    ): Promise<AgentMiddlewareCorrelatedExecution[]> {
        const bindings = (
            await this.resolveExternalAssistantBindings(input.requesterXpertId, input.requesterAgentKey)
        ).filter((binding) => binding.status === 'available')
        if (!bindings.length) return []
        const bindingByXpertId = new Map(bindings.map((binding) => [binding.xpertId, binding]))
        const result = await this.queryBus.execute<FindAgentExecutionsQuery, { items: IXpertAgentExecution[] }>(
            new FindAgentExecutionsQuery({
                where: { xpertId: In([...bindingByXpertId.keys()]) } as never,
                order: { createdAt: 'DESC' },
                take: Math.min(Math.max(input.limit ?? 100, 1), 200)
            })
        )
        return (result.items ?? []).flatMap((execution) => {
            const metadata = execution.metadata
            const inputRecord =
                execution.inputs && typeof execution.inputs === 'object' && !Array.isArray(execution.inputs)
                    ? execution.inputs
                    : undefined
            const correlation =
                metadata && typeof metadata === 'object' && !Array.isArray(metadata)
                    ? (readJsonRecordOrString(metadata, 'correlation') ??
                      (inputRecord ? readJsonRecordOrString(inputRecord, 'executionCorrelation') : undefined))
                    : inputRecord
                      ? readJsonRecordOrString(inputRecord, 'executionCorrelation')
                      : undefined
            if (metadata?.['requesterXpertId'] !== input.requesterXpertId || !correlation) return []
            const namespace = readRecordString(correlation, 'namespace')
            const operationId = readRecordString(correlation, 'operationId')
            const subjectId = readRecordString(correlation, 'subjectId')
            if (
                namespace !== input.namespace ||
                subjectId !== input.subjectId ||
                !operationId ||
                !execution.id ||
                !execution.xpertId
            )
                return []
            const binding = bindingByXpertId.get(execution.xpertId)
            if (!binding) return []
            const correlationAttributes = readJsonRecordOrString(correlation, 'attributes')
            const flowExecution = inputRecord ? readJsonRecordOrString(inputRecord, 'flowExecution') : undefined
            const envelopeMatchesCorrelation =
                flowExecution &&
                readRecordString(flowExecution, 'operationId') === operationId &&
                readRecordString(flowExecution, 'caseId') === subjectId
            // Chat collaborator calls already persist their structured inputs on
            // the child execution. Treat the governed flowExecution envelope as
            // the canonical correlation attributes when the caller did not
            // redundantly copy those fields into executionCorrelation.attributes.
            const attributes = correlationAttributes ?? (envelopeMatchesCorrelation ? flowExecution : undefined)
            return [
                {
                    operationId,
                    subjectId,
                    ...(attributes ? { attributes } : {}),
                    status: mapExecutionStatusToTaskStatus(execution.status),
                    executionId: execution.id,
                    ...(execution.parentId ? { parentExecutionId: execution.parentId } : {}),
                    ...(execution.threadId ? { threadId: execution.threadId } : {}),
                    executorXpertId: execution.xpertId,
                    ...(execution.agentKey || binding.primaryAgentKey
                        ? { executorAgentKey: execution.agentKey ?? binding.primaryAgentKey }
                        : {}),
                    ...(binding.templateSource?.templateKey
                        ? { executorAssistantTemplateKey: binding.templateSource.templateKey }
                        : {}),
                    ...(binding.title ? { executorAssistantTitle: binding.title } : {}),
                    ...(binding.publishedVersion ? { executorPublishedVersion: binding.publishedVersion } : {}),
                    ...(dateString(execution.createdAt) ? { startedAt: dateString(execution.createdAt) } : {}),
                    ...(dateString(execution.updatedAt) ? { updatedAt: dateString(execution.updatedAt) } : {})
                }
            ]
        })
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

    /** Starts a task on the current Assistant or one deterministically resolved external Assistant. */
    async startAssistantTask(input: AgentMiddlewareAssistantTaskInput): Promise<AgentMiddlewareAssistantTaskResult> {
        const requesterXpertId = normalizeOptionalString(input.xpertId)
        const prompt = normalizeOptionalString(input.prompt)
        if (!requesterXpertId) {
            throw new Error('xpertId is required to start an assistant task')
        }
        if (!prompt) {
            throw new Error('prompt is required to start an assistant task')
        }

        if (input.target && input.target.requesterXpertId !== requesterXpertId) {
            throw new Error('External Assistant requester must match xpertId')
        }
        // Reject invalid or ambiguous bindings before creating conversation or execution rows.
        const externalBinding = input.target ? await this.resolveExternalAssistantTarget(input.target) : undefined
        const xpertId = externalBinding?.xpertId ?? requesterXpertId
        const agentKey = externalBinding?.primaryAgentKey ?? normalizeOptionalString(input.agentKey)
        const executionAssistant = externalBinding ?? (await this.resolveAssistantExecutionDescriptor(xpertId))

        // Resolve portable plugin skill references before creating any task rows.
        // This keeps invalid or cross-Agent selections from leaving partial runs.
        const assistantTaskSkillSelection = await this.resolveAssistantTaskSkillSelection(
            xpertId,
            agentKey,
            input.selectedSkillRefs
        )

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
                projectId: normalizeOptionalString(input.projectId),
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
                agentKey,
                status: XpertAgentExecutionStatusEnum.RUNNING,
                threadId: conversation.threadId,
                metadata: {
                    from: 'job',
                    requesterXpertId,
                    ...(input.correlation ? { correlation: input.correlation } : {})
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
                agentKey,
                from: 'job',
                ...(requestedTaskId ? { taskId: requestedTaskId } : {}),
                projectId: normalizeOptionalString(input.projectId) ?? undefined,
                context: input.context,
                ...(assistantTaskSkillSelection ? { assistantTaskSkillSelection } : {}),
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
            executionId: execution.id,
            executorXpertId: xpertId,
            ...(agentKey ? { executorAgentKey: agentKey } : {}),
            ...(executionAssistant?.templateSource?.templateKey
                ? { executorAssistantTemplateKey: executionAssistant.templateSource.templateKey }
                : {}),
            ...(executionAssistant?.title ? { executorAssistantTitle: executionAssistant.title } : {}),
            ...(executionAssistant?.publishedVersion
                ? { executorPublishedVersion: executionAssistant.publishedVersion }
                : {})
        }
    }

    /** Resolves optional display metadata for the actual execution Assistant. */
    private async resolveAssistantExecutionDescriptor(xpertId: string) {
        try {
            const xpert = await this.queryBus.execute<FindXpertQuery, IXpert>(
                new FindXpertQuery({ id: xpertId }, { relations: ['agent'] })
            )
            return describeExternalAssistantBinding(xpert, xpert)
        } catch {
            return undefined
        }
    }

    /** Require exactly one same-organization, published Assistant matching template and Agent identity. */
    private async resolveExternalAssistantTarget(
        target: NonNullable<AgentMiddlewareAssistantTaskInput['target']>
    ): Promise<ResolvedExternalAssistantBinding> {
        const bindings = await this.resolveExternalAssistantBindings(target.requesterXpertId, target.requesterAgentKey)
        const matching = bindings.filter((binding) => matchesExternalAssistantExpectation(binding, target.expectation))
        if (matching.length > 1) {
            throw new Error('assistant_binding_ambiguous')
        }
        const binding = matching[0]
        if (!binding) {
            const unpublished = bindings.some(
                (candidate) =>
                    candidate.status === 'unpublished' &&
                    candidate.templateSource?.templateKey === target.expectation.templateKey &&
                    candidate.primaryAgentKey === target.expectation.agentKey
            )
            const nearMatch = bindings.some(
                (candidate) =>
                    candidate.templateSource?.templateKey === target.expectation.templateKey ||
                    candidate.primaryAgentKey === target.expectation.agentKey
            )
            throw new Error(
                unpublished
                    ? 'assistant_unpublished'
                    : nearMatch
                      ? 'assistant_binding_incompatible'
                      : 'assistant_binding_missing'
            )
        }
        if (binding.status === 'unpublished') throw new Error('assistant_unpublished')
        if (binding.status !== 'available') throw new Error('assistant_binding_incompatible')
        return binding
    }

    /** The requester primary Agent is the trust anchor; nested and optional Xpert edges are excluded. */
    private async resolveExternalAssistantBindings(
        requesterXpertIdValue: string,
        requesterAgentKeyValue: string
    ): Promise<ResolvedExternalAssistantBinding[]> {
        const requesterXpertId = normalizeOptionalString(requesterXpertIdValue)
        const requesterAgentKey = normalizeOptionalString(requesterAgentKeyValue)
        if (!requesterXpertId || !requesterAgentKey) return []
        const requester = await this.queryBus.execute<FindXpertQuery, IXpert>(
            new FindXpertQuery({ id: requesterXpertId }, { relations: ['agent'] })
        )
        if (requester.agent?.key !== requesterAgentKey) return []
        const targetIds = directExternalAssistantIds(requester, requesterAgentKey)
        const candidates = await Promise.all(
            targetIds.map(async (id) => {
                try {
                    return await this.queryBus.execute<FindXpertQuery, IXpert>(
                        new FindXpertQuery({ id }, { relations: ['agent'] })
                    )
                } catch {
                    return null
                }
            })
        )
        return candidates
            .filter((candidate): candidate is IXpert => Boolean(candidate))
            .map((candidate) => describeExternalAssistantBinding(requester, candidate))
    }

    /**
     * Resolves portable plugin skill identities to workspace-local package IDs
     * only after proving that the target Agent directly owns those skills.
     */
    private async resolveAssistantTaskSkillSelection(
        xpertId: string,
        requestedAgentKey: string | undefined,
        references: AgentMiddlewareAssistantTaskInput['selectedSkillRefs']
    ): Promise<{ workspaceId: string; skillIds: string[] } | undefined> {
        const normalizedReferences = Array.from(
            new Map(
                (references ?? [])
                    .map((reference) => ({
                        pluginName: reference.pluginName?.trim(),
                        componentKey: reference.componentKey?.trim()
                    }))
                    .filter((reference) => reference.pluginName && reference.componentKey)
                    .map((reference) => [`${reference.pluginName}\u0000${reference.componentKey}`, reference] as const)
            ).values()
        )
        if (!normalizedReferences.length) {
            return undefined
        }
        if (normalizedReferences.length > 12) {
            throw new Error('Assistant Task selectedSkillRefs cannot contain more than 12 skills')
        }
        const xpert = await this.queryBus.execute<FindXpertQuery, IXpert>(
            new FindXpertQuery({ id: xpertId }, { relations: ['agent'] })
        )
        const runtimeXpert = figureOutXpert(xpert, false)
        const agentKey = requestedAgentKey || runtimeXpert.agent?.key
        const workspaceId = runtimeXpert.workspaceId?.trim()
        if (!agentKey || !workspaceId || !runtimeXpert.graph) {
            throw new Error('Assistant Task target Agent or workspace is unavailable')
        }

        const skillsMiddlewareNodes = getAgentMiddlewareNodes(runtimeXpert.graph, agentKey).filter((node) => {
            const middleware = node.entity as IWFNMiddleware
            return normalizeMiddlewareProvider(middleware?.provider) === SKILLS_MIDDLEWARE_NAME
        })
        if (skillsMiddlewareNodes.length !== 1) {
            throw new Error(
                `Assistant Task target Agent "${agentKey}" must be directly connected to exactly one Skills Middleware`
            )
        }
        const configuredSkillIds = new Set<string>(
            (skillsMiddlewareNodes[0].entity as IWFNMiddleware)?.options?.skills?.filter(
                (skillId: unknown): skillId is string => typeof skillId === 'string' && Boolean(skillId.trim())
            ) ?? []
        )
        if (!configuredSkillIds.size) {
            throw new Error(`Assistant Task target Agent "${agentKey}" has no directly connected skills`)
        }

        // Cross the SkillPackage module through CQRS so the global runtime does
        // not import that module (which would create a Nest bootstrap cycle).
        const packages = await this.queryBus.execute(
            new ResolveRuntimeSkillPackagesQuery(workspaceId, [...configuredSkillIds], RequestContext.currentUser())
        )
        // sharedSkillId is the stable bridge between plugin manifests and the
        // workspace-local package UUIDs consumed by Agent runtime state.
        const packageBySharedId = new Map(
            (packages ?? [])
                .filter((skillPackage) => configuredSkillIds.has(skillPackage.id) && skillPackage.sharedSkillId)
                .map((skillPackage) => [skillPackage.sharedSkillId as string, skillPackage])
        )
        const resolvedSkillIds = normalizedReferences.map((reference) => {
            const sharedSkillId = `plugin:${reference.pluginName}:skill:${reference.componentKey}`
            const skillPackage = packageBySharedId.get(sharedSkillId)
            if (!skillPackage) {
                throw new Error(
                    `Skill "${reference.pluginName}/${reference.componentKey}" is not directly connected to target Agent "${agentKey}"`
                )
            }
            return skillPackage.id
        })

        return { workspaceId, skillIds: resolvedSkillIds }
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

    resolveSelectedConnectorRuntimeBindings(scope: AgentMiddlewareRuntimeScope) {
        return this.connectors.resolveSelectedRuntimeBindings(scope.connectorBindingIds, scope)
    }

    /**
     * Build an Agent middleware runtime API for a specific invocation scope.
     *
     * The workspace-files capability is scoped here so plugin tools can receive
     * simple sandbox paths while server-side reads still honor the current
     * project/Xpert workspace boundary.
    */
    createScopedApi(scope: AgentMiddlewareRuntimeScope = {}): AgentMiddlewareRuntimeApi {
        const workspaceFilesApi = hasBoundRuntimeWorkspaceScope(scope)
            ? this.workspaceFiles.createScopedApi(scope)
            : null
        const artifactsApi = this.artifacts.createScopedApi({
            ...scope,
            organizationId: scope.organizationId ?? RequestContext.getOrganizationId()
        })
        const collaborationApi = this.collaboration.createScopedApi(scope)
        const actorTokenApi = this.createActorTokenApi(scope)
        const connectorApi = this.connectors.createScopedRuntimeApi(scope)
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
                    deleteDocuments: (input) => this.deleteKnowledgebaseDocuments(input),
                    readImage: (input) => this.readKnowledgebaseDocumentImage(input)
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
                    listExternalAssistantBindings: (input) => this.listExternalAssistantBindings(input),
                    listCorrelatedExecutions: (input) => this.listCorrelatedAssistantExecutions(input),
                    getTaskStatus: (input) => this.getAssistantTaskStatus(input),
                    cancelTask: (input) => this.cancelAssistantTask(input)
                }
            ],
            [
                FileRuntimeCapability,
                {
                    resolveFile: (input) => this.resolveFile(input, scope)
                }
            ],
            [ConnectorRuntimeCapability, connectorApi],
            [ArtifactsRuntimeCapability, artifactsApi],
            [CollaborationRuntimeCapability, collaborationApi],
            // Provisioning is host-authorized and deliberately separate from
            // Agent-visible tools; plugins access it through runtime capabilities.
            [
                ProjectProvisioningRuntimeCapability,
                {
                    ensure: (input) => this.ensureProject(input)
                }
            ]
        ])
        if (workspaceFilesApi) {
            capabilities.register(WorkspaceFilesRuntimeCapability, workspaceFilesApi)
            capabilities.register(
                KnowledgeDocumentVisualAssetsRuntimeCapability,
                this.visualAssetsRuntime(scope, workspaceFilesApi)
            )
        }

        return {
            createModelClient: (copilotModel, options) => this.createModelClient(copilotModel, options, scope, true),
            getModelProvider: (provider) => this.getModelProvider(provider, scope),
            wrapWorkflowNodeExecution: (...args) => this.wrapWorkflowNodeExecution(...args),
            emitMiddlewareEvent: (...args) => this.emitMiddlewareEvent(...args),
            capabilities
        } satisfies AgentMiddlewareRuntimeApi
    }

    private visualAssetsRuntime(scope: AgentMiddlewareRuntimeScope, workspaceFiles: WorkspaceFilesApi) {
        return this.moduleRef
            .get<KnowledgeDocumentVisualAssetsRuntimeFactory>(KNOWLEDGE_DOCUMENT_VISUAL_ASSETS_RUNTIME, {
                strict: false
            })
            .createScopedApi(scope, { workspaceFiles })
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
            thread_id: normalizeOptionalString(scope.threadId),
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

    private resolveFileAssetAuthority(scope: AgentMiddlewareRuntimeScope): FileAssetAuthority {
        const conversationId = normalizeOptionalString(scope.conversationId)
        return conversationId ? { kind: 'conversation', conversationId } : { kind: 'current-owner' }
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

function readRecordString(value: object, key: string) {
    const candidate = Reflect.get(value, key)
    return typeof candidate === 'string' ? candidate.trim() : ''
}

function readJsonRecord(value: object, key: string): Record<string, any> | undefined {
    const candidate = Reflect.get(value, key)
    return candidate && typeof candidate === 'object' && !Array.isArray(candidate)
        ? (candidate as Record<string, any>)
        : undefined
}

function readJsonRecordOrString(value: object, key: string): Record<string, any> | undefined {
    const candidate = Reflect.get(value, key)
    const record = readJsonRecord(value, key)
    if (record) return record
    if (typeof candidate !== 'string' || !candidate.trim()) return undefined
    try {
        const parsed = JSON.parse(candidate)
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, any>)
            : undefined
    } catch {
        return undefined
    }
}

function dateString(value: unknown) {
    if (value instanceof Date) return value.toISOString()
    if (typeof value !== 'string' || !value.trim()) return ''
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function normalizeOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
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

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)) as T
}

/** Workspace capabilities are safe only when the host binds a concrete data owner. */
function hasBoundRuntimeWorkspaceScope(scope: AgentMiddlewareRuntimeScope) {
    return Boolean(normalizeOptionalString(scope.projectId) || normalizeOptionalString(scope.xpertId))
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
