import { ICopilotModel, IXpertAgentExecution } from '@xpert-ai/contracts'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import {
    ActorTokenRequest,
    ActorTokenResult,
    ActorTokenRuntimeCapability,
    AgentMiddlewareEvent,
    AgentMiddlewareModelClient,
    AgentMiddlewareModelProviderConnection,
    AgentMiddlewareRuntimeApi,
    AgentMiddlewareRuntimeScope,
    AgentMiddlewareWrapWorkflowNodeExecutionParams,
    AgentMiddlewareWrapWorkflowNodeExecutionResult,
    ArtifactsRuntimeCapability,
    AssistantTaskRuntimeCapability,
    CollaborationRuntimeCapability,
    ConnectorRuntimeCapability,
    DefaultRuntimeCapabilityRegistry,
    FileRuntimeCapability,
    KnowledgebaseDocumentsRuntimeCapability,
    KnowledgebaseProvisioningRuntimeCapability,
    KnowledgebaseRuntimeCapability,
    KnowledgeDocumentVisualAssetsRuntimeCapability,
    ProjectProvisioningRuntimeCapability,
    RequestContext,
    type RuntimeCapabilityRegistry,
    type WorkspaceFilesApi,
    WorkspaceFilesRuntimeCapability,
    XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import { OutboundActorTokenProvider } from '@xpert-ai/server-core'
import { ArtifactsService } from '../../../artifacts/artifacts.service'
import { CollaborationService } from '../../../collaboration/collaboration.service'
import { ConnectorService } from '../../../connector/connector.service'
import {
    KNOWLEDGE_DOCUMENT_VISUAL_ASSETS_RUNTIME,
    type KnowledgeDocumentVisualAssetsRuntimeFactory
} from '../../../knowledge-document/visual-assets-runtime.token'
import { WorkspaceFilesRuntimeCapabilityService } from '../../runtime/workspace-files-runtime-capability.service'
import { AgentMiddlewareAssistantTaskRuntimeService } from './assistant-task-runtime.service'
import { AgentMiddlewareFileRuntimeService } from './file-runtime.service'
import { AgentMiddlewareKnowledgeRuntimeService } from './knowledge-runtime.service'
import { AgentMiddlewareModelRuntimeService, type AgentMiddlewareRuntimeModelOptions } from './model-runtime.service'
import { normalizeOptionalString } from './utils'

export type { AgentMiddlewareRuntimeModelOptions } from './model-runtime.service'

/**
 * Stable facade that assembles invocation-scoped middleware capabilities.
 * Domain behavior lives in focused runtime services so this class only owns
 * capability composition and scope-specific host integrations.
 */
@Injectable()
export class AgentMiddlewareRuntimeService {
    readonly api: AgentMiddlewareRuntimeApi

    constructor(
        private readonly modelRuntime: AgentMiddlewareModelRuntimeService,
        private readonly knowledgeRuntime: AgentMiddlewareKnowledgeRuntimeService,
        private readonly fileRuntime: AgentMiddlewareFileRuntimeService,
        private readonly assistantTaskRuntime: AgentMiddlewareAssistantTaskRuntimeService,
        private readonly connectors: ConnectorService,
        private readonly workspaceFiles: WorkspaceFilesRuntimeCapabilityService,
        private readonly artifacts: ArtifactsService,
        private readonly collaboration: CollaborationService,
        private readonly moduleRef: ModuleRef,
        @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
        private readonly platformCapabilities: RuntimeCapabilityRegistry,
        @Optional()
        private readonly outboundActorTokenProvider?: OutboundActorTokenProvider
    ) {
        this.api = this.createScopedApi()
    }

    createModelClient<T = AgentMiddlewareModelClient>(
        copilotModel: ICopilotModel,
        options: AgentMiddlewareRuntimeModelOptions,
        scope: AgentMiddlewareRuntimeScope = {},
        recordApplicationMetrics = false
    ): Promise<T> {
        return this.modelRuntime.createModelClient<T>(copilotModel, options, scope, recordApplicationMetrics)
    }

    getModelProvider(
        provider: string,
        scope: AgentMiddlewareRuntimeScope = {}
    ): Promise<AgentMiddlewareModelProviderConnection> {
        return this.modelRuntime.getModelProvider(provider, scope)
    }

    wrapWorkflowNodeExecution<T>(
        run: (execution: Partial<IXpertAgentExecution>) => Promise<AgentMiddlewareWrapWorkflowNodeExecutionResult<T>>,
        params: AgentMiddlewareWrapWorkflowNodeExecutionParams
    ): Promise<T> {
        return this.modelRuntime.wrapWorkflowNodeExecution(run, params)
    }

    emitMiddlewareEvent(event: AgentMiddlewareEvent): Promise<void> {
        return this.modelRuntime.emitMiddlewareEvent(event)
    }

    listKnowledgebases(...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['listKnowledgebases']>) {
        return this.knowledgeRuntime.listKnowledgebases(...args)
    }

    ensureKnowledgebases(...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['ensureKnowledgebases']>) {
        return this.knowledgeRuntime.ensureKnowledgebases(...args)
    }

    ensureProject(...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['ensureProject']>) {
        return this.knowledgeRuntime.ensureProject(...args)
    }

    connectAgentKnowledgebases(
        ...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['connectAgentKnowledgebases']>
    ) {
        return this.knowledgeRuntime.connectAgentKnowledgebases(...args)
    }

    searchKnowledgebase(...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['searchKnowledgebase']>) {
        return this.knowledgeRuntime.searchKnowledgebase(...args)
    }

    writeKnowledgeChunk(...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['writeKnowledgeChunk']>) {
        return this.knowledgeRuntime.writeKnowledgeChunk(...args)
    }

    deleteKnowledgeChunks(...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['deleteKnowledgeChunks']>) {
        return this.knowledgeRuntime.deleteKnowledgeChunks(...args)
    }

    uploadKnowledgebaseDocumentFile(
        ...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['uploadKnowledgebaseDocumentFile']>
    ) {
        return this.knowledgeRuntime.uploadKnowledgebaseDocumentFile(...args)
    }

    listKnowledgebaseDocuments(
        ...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['listKnowledgebaseDocuments']>
    ) {
        return this.knowledgeRuntime.listKnowledgebaseDocuments(...args)
    }

    createKnowledgebaseFolder(
        ...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['createKnowledgebaseFolder']>
    ) {
        return this.knowledgeRuntime.createKnowledgebaseFolder(...args)
    }

    moveKnowledgebaseDocument(
        ...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['moveKnowledgebaseDocument']>
    ) {
        return this.knowledgeRuntime.moveKnowledgebaseDocument(...args)
    }

    importKnowledgebaseArchive(
        ...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['importKnowledgebaseArchive']>
    ) {
        return this.knowledgeRuntime.importKnowledgebaseArchive(...args)
    }

    createKnowledgebaseDocuments(
        ...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['createKnowledgebaseDocuments']>
    ) {
        return this.knowledgeRuntime.createKnowledgebaseDocuments(...args)
    }

    startKnowledgebaseDocumentsProcessing(
        ...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['startKnowledgebaseDocumentsProcessing']>
    ) {
        return this.knowledgeRuntime.startKnowledgebaseDocumentsProcessing(...args)
    }

    reprocessKnowledgebaseDocuments(
        ...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['reprocessKnowledgebaseDocuments']>
    ) {
        return this.knowledgeRuntime.reprocessKnowledgebaseDocuments(...args)
    }

    getKnowledgebaseDocumentStatus(
        ...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['getKnowledgebaseDocumentStatus']>
    ) {
        return this.knowledgeRuntime.getKnowledgebaseDocumentStatus(...args)
    }

    deleteKnowledgebaseDocuments(
        ...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['deleteKnowledgebaseDocuments']>
    ) {
        return this.knowledgeRuntime.deleteKnowledgebaseDocuments(...args)
    }

    readKnowledgebaseDocumentImage(
        ...args: Parameters<AgentMiddlewareKnowledgeRuntimeService['readKnowledgebaseDocumentImage']>
    ) {
        return this.knowledgeRuntime.readKnowledgebaseDocumentImage(...args)
    }

    resolveFile(...args: Parameters<AgentMiddlewareFileRuntimeService['resolveFile']>) {
        return this.fileRuntime.resolveFile(...args)
    }

    getAssistantTaskStatus(...args: Parameters<AgentMiddlewareAssistantTaskRuntimeService['getAssistantTaskStatus']>) {
        return this.assistantTaskRuntime.getAssistantTaskStatus(...args)
    }

    listExternalAssistantBindings(
        ...args: Parameters<AgentMiddlewareAssistantTaskRuntimeService['listExternalAssistantBindings']>
    ) {
        return this.assistantTaskRuntime.listExternalAssistantBindings(...args)
    }

    listCorrelatedAssistantExecutions(
        ...args: Parameters<AgentMiddlewareAssistantTaskRuntimeService['listCorrelatedAssistantExecutions']>
    ) {
        return this.assistantTaskRuntime.listCorrelatedAssistantExecutions(...args)
    }

    cancelAssistantTask(...args: Parameters<AgentMiddlewareAssistantTaskRuntimeService['cancelAssistantTask']>) {
        return this.assistantTaskRuntime.cancelAssistantTask(...args)
    }

    startAssistantTask(...args: Parameters<AgentMiddlewareAssistantTaskRuntimeService['startAssistantTask']>) {
        return this.assistantTaskRuntime.startAssistantTask(...args)
    }

    resolveSelectedConnectorRuntimeBindings(scope: AgentMiddlewareRuntimeScope) {
        return this.connectors.resolveSelectedRuntimeBindings(scope.connectorBindingIds, scope)
    }

    /** Build the middleware runtime API and capability registry for one invocation. */
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
        const capabilities = new DefaultRuntimeCapabilityRegistry(
            [
                [ActorTokenRuntimeCapability, actorTokenApi],
                [
                    KnowledgebaseRuntimeCapability,
                    {
                        list: (input) => this.knowledgeRuntime.listKnowledgebases(input),
                        search: (input) => this.knowledgeRuntime.searchKnowledgebase(input),
                        writeChunk: (input) => this.knowledgeRuntime.writeKnowledgeChunk(input),
                        deleteChunks: (input) => this.knowledgeRuntime.deleteKnowledgeChunks(input)
                    }
                ],
                [
                    KnowledgebaseDocumentsRuntimeCapability,
                    {
                        listDocuments: (input) => this.knowledgeRuntime.listKnowledgebaseDocuments(input),
                        createFolder: (input) => this.knowledgeRuntime.createKnowledgebaseFolder(input),
                        moveDocument: (input) => this.knowledgeRuntime.moveKnowledgebaseDocument(input),
                        uploadFile: (input) => this.knowledgeRuntime.uploadKnowledgebaseDocumentFile(input),
                        importArchive: (input) => this.knowledgeRuntime.importKnowledgebaseArchive(input),
                        createDocuments: (input) => this.knowledgeRuntime.createKnowledgebaseDocuments(input),
                        startProcessing: (input) => this.knowledgeRuntime.startKnowledgebaseDocumentsProcessing(input),
                        reprocessDocuments: (input) => this.knowledgeRuntime.reprocessKnowledgebaseDocuments(input),
                        getDocumentStatus: (input) => this.knowledgeRuntime.getKnowledgebaseDocumentStatus(input),
                        deleteDocuments: (input) => this.knowledgeRuntime.deleteKnowledgebaseDocuments(input),
                        readImage: (input) => this.knowledgeRuntime.readKnowledgebaseDocumentImage(input)
                    }
                ],
                [
                    KnowledgebaseProvisioningRuntimeCapability,
                    {
                        ensure: (input) => this.knowledgeRuntime.ensureKnowledgebases(input),
                        connectAgent: (input) => this.knowledgeRuntime.connectAgentKnowledgebases(input)
                    }
                ],
                [
                    AssistantTaskRuntimeCapability,
                    {
                        startTask: (input) => this.assistantTaskRuntime.startAssistantTask(input),
                        listExternalAssistantBindings: (input) =>
                            this.assistantTaskRuntime.listExternalAssistantBindings(input),
                        listCorrelatedExecutions: (input) =>
                            this.assistantTaskRuntime.listCorrelatedAssistantExecutions(input),
                        getTaskStatus: (input) => this.assistantTaskRuntime.getAssistantTaskStatus(input),
                        cancelTask: (input) => this.assistantTaskRuntime.cancelAssistantTask(input)
                    }
                ],
                [
                    FileRuntimeCapability,
                    {
                        resolveFile: (input) => this.fileRuntime.resolveFile(input, scope)
                    }
                ],
                [ConnectorRuntimeCapability, connectorApi],
                [ArtifactsRuntimeCapability, artifactsApi],
                [CollaborationRuntimeCapability, collaborationApi],
                [
                    ProjectProvisioningRuntimeCapability,
                    {
                        ensure: (input) => this.knowledgeRuntime.ensureProject(input)
                    }
                ]
            ],
            this.platformCapabilities
        )
        if (workspaceFilesApi) {
            capabilities.register(WorkspaceFilesRuntimeCapability, workspaceFilesApi)
            capabilities.register(
                KnowledgeDocumentVisualAssetsRuntimeCapability,
                this.visualAssetsRuntime(scope, workspaceFilesApi)
            )
        }

        return {
            createModelClient: (copilotModel, options) =>
                this.modelRuntime.createModelClient(copilotModel, options, scope, true),
            getModelProvider: (provider) => this.modelRuntime.getModelProvider(provider, scope),
            wrapWorkflowNodeExecution: (...args) => this.modelRuntime.wrapWorkflowNodeExecution(...args),
            emitMiddlewareEvent: (...args) => this.modelRuntime.emitMiddlewareEvent(...args),
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
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)) as T
}

/** Workspace capabilities are safe only when the host binds a concrete data owner. */
function hasBoundRuntimeWorkspaceScope(scope: AgentMiddlewareRuntimeScope) {
    return Boolean(normalizeOptionalString(scope.projectId) || normalizeOptionalString(scope.xpertId))
}
