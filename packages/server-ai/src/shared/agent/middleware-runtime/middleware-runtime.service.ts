import { ICopilotModel, IXpertAgentExecution } from '@xpert-ai/contracts'
import { Inject, Injectable } from '@nestjs/common'
import {
    ActorTokenRuntimeFactoryCapability,
    ConnectorRuntimeFactoryCapability,
    KnowledgeDocumentVisualAssetsRuntimeFactoryCapability,
    ActorTokenRuntimeCapability,
    AgentMiddlewareEvent,
    AgentMiddlewareModelClient,
    AgentMiddlewareModelProviderConnection,
    AgentMiddlewareRuntimeApi,
    AgentMiddlewareRuntimeScope,
    type ConfiguredRuntimeConnectorSelection,
    AgentMiddlewareWrapWorkflowNodeExecutionParams,
    AgentMiddlewareWrapWorkflowNodeExecutionResult,
    ArtifactsRuntimeCapability,
    CollaborationRuntimeCapability,
    ConnectorRuntimeCapability,
    DefaultRuntimeCapabilityRegistry,
    FileRuntimeCapability,
    KnowledgeDocumentVisualAssetsRuntimeCapability,
    RequestContext,
    type RuntimeCapabilityRegistry,
    WorkspaceFilesRuntimeCapability,
    XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import { ArtifactsService } from '../../../artifacts/artifacts.service'
import { CollaborationService } from '../../../collaboration/collaboration.service'
import { resolveAgentExecutionScope } from './execution-scope'
import { WorkspaceFilesRuntimeCapabilityService } from '../../runtime/workspace-files-runtime-capability.service'
import { FileRuntimeService } from '../../../file-understanding/runtime/file-runtime.service'
import { AgentMiddlewareModelRuntimeService, type AgentMiddlewareRuntimeModelOptions } from './model-runtime.service'
import { normalizeOptionalString } from '../../runtime/runtime-input'

export type { AgentMiddlewareRuntimeModelOptions } from './model-runtime.service'

/**
 * Stable facade that assembles invocation-scoped middleware capabilities.
 * Domain behavior lives in focused runtime services so this class only owns
 * capability composition and scope-specific host integrations.
 * Shared domain capabilities are inherited from the platform registry.
 */
@Injectable()
export class AgentMiddlewareRuntimeService {
    // Do not capture the first caller identity on this shared facade or resolve factories before discovery.
    get api(): AgentMiddlewareRuntimeApi {
        return this.createScopedApi()
    }

    constructor(
        private readonly modelRuntime: AgentMiddlewareModelRuntimeService,
        private readonly fileRuntime: FileRuntimeService,
        private readonly workspaceFiles: WorkspaceFilesRuntimeCapabilityService,
        private readonly artifacts: ArtifactsService,
        private readonly collaboration: CollaborationService,
        @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
        private readonly platformCapabilities: RuntimeCapabilityRegistry
    ) {}

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

    resolveSelectedConnectorRuntimeBindings(scope: AgentMiddlewareRuntimeScope) {
        return this.platformCapabilities
            .require(ConnectorRuntimeFactoryCapability)
            .resolveSelectedRuntimeBindings(scope.connectorBindingIds, scope)
    }

    resolveConfiguredConnectorRuntimeBindings(
        selections: ConfiguredRuntimeConnectorSelection[] | null | undefined,
        scope: AgentMiddlewareRuntimeScope
    ) {
        return this.platformCapabilities
            .require(ConnectorRuntimeFactoryCapability)
            .resolveConfiguredRuntimeBindings(selections, scope)
    }

    /** Build the middleware runtime API and capability registry for one invocation. */
    createScopedApi(scope: AgentMiddlewareRuntimeScope = {}): AgentMiddlewareRuntimeApi {
        scope = { ...scope, connectorBindingIds: [...(scope.connectorBindingIds ?? [])] }
        const workspaceFilesApi = hasBoundRuntimeWorkspaceScope(scope)
            ? this.workspaceFiles.createScopedApi(scope)
            : null
        const artifactsApi = this.artifacts.createScopedApi({
            ...scope,
            organizationId: scope.organizationId ?? RequestContext.getOrganizationId()
        })
        const collaborationApi = this.collaboration.createScopedApi(scope)
        const actorTokenApi = this.platformCapabilities
            .require(ActorTokenRuntimeFactoryCapability)
            .createScopedApi({ ...scope, act: { sub: 'xpert_agent' } })
        const connectorApi = this.platformCapabilities.require(ConnectorRuntimeFactoryCapability).createScopedApi(scope)
        const capabilities = new DefaultRuntimeCapabilityRegistry(
            [
                [ActorTokenRuntimeCapability, actorTokenApi],
                [FileRuntimeCapability, this.fileRuntime.createScopedApi(scope)],
                [ConnectorRuntimeCapability, connectorApi],
                [ArtifactsRuntimeCapability, artifactsApi],
                [CollaborationRuntimeCapability, collaborationApi]
            ],
            this.platformCapabilities
        )
        if (workspaceFilesApi) {
            capabilities.register(WorkspaceFilesRuntimeCapability, workspaceFilesApi)
            capabilities.register(
                KnowledgeDocumentVisualAssetsRuntimeCapability,
                this.platformCapabilities
                    .require(KnowledgeDocumentVisualAssetsRuntimeFactoryCapability)
                    .createScopedApi(scope, {
                        workspaceFiles: workspaceFilesApi,
                        resolveExecutionScope: () => resolveAgentExecutionScope(scope)
                    })
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
}

/** Workspace capabilities are safe only when the host binds a concrete data owner. */
function hasBoundRuntimeWorkspaceScope(scope: AgentMiddlewareRuntimeScope) {
    return Boolean(normalizeOptionalString(scope.projectId) || normalizeOptionalString(scope.xpertId))
}
