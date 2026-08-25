import { DynamicStructuredTool, StructuredToolInterface } from '@langchain/core/tools'
import { BaseStore } from '@langchain/langgraph'
import { JSONValue, McpCapabilityDescriptor, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import {
    MANAGED_QUEUE_SERVICE_TOKEN,
    AnyXpertToolDefinition,
    ManagedQueueService,
    McpCapabilityRuntimeProvider,
    McpCompletionResult,
    McpPromptResult,
    McpResourceReadResult,
    ToolExecutionContext,
    ToolCredentialsApi,
    ToolHostApi,
    ToolPrincipal,
    WorkspaceFilesRuntimeCapability,
    XpertToolContent,
    XpertToolResult
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { In, IsNull, Repository } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime.service'
import { _BaseToolset, TBuiltinToolsetParams } from '../shared'
import { XpertAgentExecutionRecordUsageCommand } from '../xpert-agent-execution/commands/record-usage.command'
import { createExecutionModelUsageRecorder, TExecutionIdResolver } from '../xpert-agent-execution/types'
import { ToolNotFoundError, ToolProviderNotFoundError } from '../xpert-toolset/errors'
import { createBuiltinToolset, MCPToolset, ODataToolset } from '../xpert-toolset/provider'
import { OpenAPIToolset } from '../xpert-toolset/provider/openapi/openapi-toolset'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import { McpCapabilityCatalog } from '../mcp-publication/entities/mcp-capability-catalog.entity'
import { McpSubscriptionService } from '../mcp-publication/mcp-subscription.service'

export interface ToolRuntimeEnvironment {
    projectId?: string | null
    conversationId?: string
    xpertId?: string | null
    agentKey?: string
    executionId?: string
    signal?: AbortSignal
    env?: Record<string, unknown>
    store?: BaseStore
    getExecutionId?: TExecutionIdResolver
    /** Legacy LangChain-only values; authoritative execution context always overrides these keys. */
    configurable?: object
    /** Trusted API preview snapshots. Persisted Agent and MCP execution must not use this escape hatch. */
    toolsetSnapshots?: XpertToolset[]
}

export interface LoadToolsetsRequest extends ToolRuntimeEnvironment {
    source?: ToolExecutionContext['source']
    tenantId?: string
    organizationId?: string | null
    workspaceId?: string | null
    principal: ToolPrincipal
    toolsetIds: string[]
    host?: ToolHostApi
}

export interface DescribeCapabilitiesRequest {
    tenantId: string
    organizationId?: string | null
    toolsetIds: string[]
}

export interface ExecuteToolRequest extends ToolRuntimeEnvironment {
    source: ToolExecutionContext['source']
    principal: ToolPrincipal
    tenantId: string
    organizationId?: string | null
    workspaceId?: string
    toolsetId: string
    toolName: string
    serverName?: string
    remoteName?: string
    remoteTaskMode?: 'optional' | 'required'
    arguments: unknown
    executionId: string
    requestId: string
    traceId?: string
    host?: ToolHostApi
}

export interface ExecuteMcpCapabilityRequest extends ToolRuntimeEnvironment {
    source: ToolExecutionContext['source']
    principal: ToolPrincipal
    tenantId: string
    organizationId?: string | null
    workspaceId?: string
    toolsetId: string
    capabilityKey: string
    serverName?: string
    remoteName?: string
    executionId: string
    requestId: string
    traceId?: string
    host?: ToolHostApi
}

export interface ExecuteMcpResourceRequest extends ExecuteMcpCapabilityRequest {
    capabilityType: 'resource' | 'resource_template' | 'app'
    uri: string
    arguments?: Record<string, string>
}

export interface ExecuteMcpPromptRequest extends ExecuteMcpCapabilityRequest {
    name: string
    arguments: Record<string, string>
}

export interface CompleteMcpCapabilityRequest extends ExecuteMcpCapabilityRequest {
    reference: { type: 'resource'; value: string } | { type: 'prompt'; value: string }
    argument: { name: string; value: string }
    arguments?: Record<string, string>
}

@Injectable()
export class ToolRuntimeService {
    readonly #logger = new Logger(ToolRuntimeService.name)
    readonly #declaredToolAdapters = new WeakSet<_BaseToolset<StructuredToolInterface>>()
    readonly #runtimeHosts = new WeakMap<_BaseToolset<StructuredToolInterface>, ToolHostApi>()
    readonly #runtimeToolsets = new WeakMap<_BaseToolset<StructuredToolInterface>, XpertToolset>()

    constructor(
        @InjectRepository(XpertToolset)
        private readonly toolsetRepository: Repository<XpertToolset>,
        @InjectRepository(McpCapabilityCatalog)
        private readonly capabilityRepository: Repository<McpCapabilityCatalog>,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly modelRuntime: AgentMiddlewareRuntimeService,
        private readonly subscriptions: McpSubscriptionService,
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
        private readonly managedQueue: ManagedQueueService
    ) {}

    /**
     * Loads Agent-compatible toolset runtimes from an explicit scope. This remains
     * public while existing Agent call sites consume the same runtime instances.
     */
    async loadToolsets(request: LoadToolsetsRequest): Promise<_BaseToolset<StructuredToolInterface>[]> {
        if (!request.toolsetIds.length) {
            return []
        }

        const workspaceId = normalizeWorkspaceId(request.workspaceId)
        const toolsets = await this.resolveToolsets(request, workspaceId)

        const executionIdSource = request.getExecutionId ?? request.executionId
        const usageRecorder = executionIdSource
            ? createExecutionModelUsageRecorder(executionIdSource, async (executionId, usage) => {
                  await this.commandBus.execute(new XpertAgentExecutionRecordUsageCommand(executionId, usage))
              })
            : undefined
        const baseContext: Omit<TBuiltinToolsetParams, 'modelRuntime'> = {
            conversationId: request.conversationId,
            tenantId: request.tenantId,
            organizationId: request.organizationId ?? undefined,
            commandBus: this.commandBus,
            queryBus: this.queryBus,
            userId: request.principal.userId,
            projectId: request.projectId,
            xpertId: request.xpertId,
            agentKey: request.agentKey,
            executionId: request.executionId,
            signal: request.signal,
            env: request.env,
            store: request.store,
            managedQueue: this.managedQueue
        }

        const runtimeEntries = await Promise.all(
            toolsets.map(async (toolset) => {
                const effectiveWorkspaceId = toolsetWorkspaceId(request, toolset)
                const scopedModelRuntime = this.modelRuntime.createScopedApi({
                    tenantId: request.tenantId,
                    organizationId: request.organizationId ?? undefined,
                    userId: request.principal.userId,
                    workspaceId: effectiveWorkspaceId,
                    projectId: request.projectId,
                    xpertId: request.xpertId,
                    conversationId: request.conversationId,
                    agentKey: request.agentKey,
                    executionId: request.executionId,
                    usageCallback: usageRecorder?.usageCallback
                })
                const context: TBuiltinToolsetParams = {
                    ...baseContext,
                    env: {
                        ...(request.env ?? {}),
                        ...(effectiveWorkspaceId ? { workspaceId: effectiveWorkspaceId } : {})
                    },
                    modelRuntime: {
                        createModelClient: scopedModelRuntime.createModelClient,
                        getModelProvider: scopedModelRuntime.getModelProvider,
                        reportUsage: usageRecorder?.reportUsage
                    }
                }
                let runtime: _BaseToolset<StructuredToolInterface>
                switch (toolset.category) {
                    case XpertToolsetCategoryEnum.BUILTIN:
                        runtime = await createBuiltinToolset(toolset.type, toolset, context)
                        break
                    case XpertToolsetCategoryEnum.API:
                        if (toolset.type === 'openapi') {
                            runtime = new OpenAPIToolset(toolset, context.modelRuntime.reportUsage)
                            break
                        }
                        if (toolset.type === 'odata') {
                            runtime = new ODataToolset(toolset)
                            break
                        }
                        throw new ToolProviderNotFoundError(`API Tool type '${toolset.type}' not found`)
                    case XpertToolsetCategoryEnum.MCP:
                        runtime = new MCPToolset(toolset, context)
                        break
                    default:
                        throw new ToolProviderNotFoundError(`Tool category '${toolset.category}' not found`)
                }
                return { runtime, scopedModelRuntime }
            })
        )
        for (const [index, { runtime, scopedModelRuntime }] of runtimeEntries.entries()) {
            const workspaceFiles =
                request.host?.files ?? scopedModelRuntime.capabilities?.get(WorkspaceFilesRuntimeCapability)
            const defaultHost: ToolHostApi = {
                ...(request.host ?? {}),
                ...(workspaceFiles ? { files: workspaceFiles } : {}),
                credentials: createToolCredentialsApi(toolsets[index].credentials),
                events: this.subscriptions.eventsApiForToolset(toolsets[index].id, request.host?.events),
                models: {
                    createModelClient: scopedModelRuntime.createModelClient,
                    getModelProvider: scopedModelRuntime.getModelProvider
                }
            }
            this.#runtimeToolsets.set(runtime, toolsets[index])
            this.#runtimeHosts.set(runtime, defaultHost)
            this.attachDeclaredToolAdapters(
                runtime,
                { ...request, workspaceId: toolsetWorkspaceId(request, toolsets[index]) },
                defaultHost
            )
        }
        return runtimeEntries.map(({ runtime }) => runtime)
    }

    /** Returns only explicitly declared, persistence-backed capabilities. */
    async describeCapabilities(request: DescribeCapabilitiesRequest): Promise<McpCapabilityDescriptor[]> {
        if (!request.toolsetIds.length) {
            return []
        }

        const capabilities = await this.capabilityRepository.find({
            where: {
                toolsetId: In(request.toolsetIds),
                tenantId: request.tenantId,
                ...(request.organizationId !== undefined ? { organizationId: request.organizationId ?? IsNull() } : {}),
                enabled: true
            }
        })

        return capabilities.map((capability) =>
            withAuthoritativeToolsetSource(capability.descriptor, capability.toolsetId)
        )
    }

    async executeTool(request: ExecuteToolRequest): Promise<XpertToolResult> {
        const [toolset] = await this.loadToolsets({
            ...request,
            toolsetIds: [request.toolsetId]
        })
        if (!toolset) {
            throw new ToolNotFoundError(`Toolset '${request.toolsetId}' was not found in the requested workspace`)
        }

        const executionContext: ToolExecutionContext = {
            source: request.source,
            tenantId: request.tenantId,
            organizationId: request.organizationId ?? undefined,
            ...optionalWorkspaceContext(toolsetWorkspaceId(request, this.#runtimeToolsets.get(toolset))),
            projectId: request.projectId ?? undefined,
            principal: request.principal,
            executionId: request.executionId,
            requestId: request.requestId,
            traceId: request.traceId,
            conversationId: request.conversationId,
            xpertId: request.xpertId ?? undefined,
            agentKey: request.agentKey,
            signal: request.signal,
            host: this.#runtimeHosts.get(toolset) ?? request.host ?? {}
        }

        try {
            await toolset.initTools()
            const declaredTool = declaredToolDefinition(toolset, request.toolName)
            if (declaredTool) {
                return this.executeDeclaredTool(declaredTool, request.arguments, executionContext)
            }
            if (toolset instanceof MCPToolset && request.serverName && request.remoteName) {
                const result = request.remoteTaskMode
                    ? await toolset.callMcpTaskTool(
                          request.remoteName,
                          requireToolArguments(request.arguments),
                          request.serverName,
                          request.signal,
                          request.host?.input
                      )
                    : await toolset.callMcpTool(
                          request.remoteName,
                          requireToolArguments(request.arguments),
                          request.serverName,
                          request.signal,
                          request.host?.input
                      )
                return normalizeToolResult(result)
            }
            const tool = toolset.getTool(request.toolName)
            if (!tool) {
                throw new ToolNotFoundError(
                    `Tool '${request.toolName}' was not found in toolset '${request.toolsetId}'`
                )
            }
            const result = await tool.invoke(request.arguments, {
                configurable: {
                    ...(request.configurable ?? {}),
                    ...executionContext,
                    userId: request.principal.userId,
                    tool_call_id: request.requestId,
                    toolExecutionContext: executionContext
                }
            })
            return normalizeToolResult(result)
        } finally {
            try {
                await toolset.close()
            } catch (error) {
                this.#logger.debug(error)
            }
        }
    }

    private async resolveToolsets(request: LoadToolsetsRequest, workspaceId: string | null) {
        const requestedIds = [...new Set(request.toolsetIds)]
        const snapshots = request.toolsetSnapshots ?? []
        if (snapshots.length && request.source !== 'api') {
            throw new ToolProviderNotFoundError(
                toolRuntimeMessage(
                    'server-ai:Error.McpToolsetSnapshotApiOnly',
                    'Toolset snapshots are restricted to the explicit API preview path.'
                )
            )
        }
        const snapshotById = new Map<string, XpertToolset>()
        for (const snapshot of snapshots) {
            const snapshotId = snapshot.id?.trim()
            if (!snapshotId || !requestedIds.includes(snapshotId)) {
                throw new ToolProviderNotFoundError(
                    toolRuntimeMessage(
                        'server-ai:Error.McpToolsetSnapshotIdentityMismatch',
                        'Toolset snapshot identity does not match the requested toolset.'
                    )
                )
            }
            if (!request.tenantId || !workspaceId) {
                throw new ToolProviderNotFoundError(
                    toolRuntimeMessage(
                        'server-ai:Error.McpToolsetSnapshotScopeRequired',
                        'Toolset snapshots require explicit tenant and workspace scope.'
                    )
                )
            }
            if (snapshot.tenantId && snapshot.tenantId !== request.tenantId) {
                throw new ToolProviderNotFoundError(
                    toolRuntimeMessage(
                        'server-ai:Error.McpToolsetSnapshotTenantMismatch',
                        'Toolset snapshot is outside the requested tenant.'
                    )
                )
            }
            if (snapshot.workspaceId && snapshot.workspaceId !== workspaceId) {
                throw new ToolProviderNotFoundError(
                    toolRuntimeMessage(
                        'server-ai:Error.McpToolsetSnapshotWorkspaceMismatch',
                        'Toolset snapshot is outside the requested workspace.'
                    )
                )
            }
            if (snapshot.organizationId && snapshot.organizationId !== request.organizationId) {
                throw new ToolProviderNotFoundError(
                    toolRuntimeMessage(
                        'server-ai:Error.McpToolsetSnapshotOrganizationMismatch',
                        'Toolset snapshot is outside the requested organization.'
                    )
                )
            }
            snapshotById.set(
                snapshotId,
                Object.assign(new XpertToolset(), snapshot, {
                    tenantId: request.tenantId,
                    organizationId: request.organizationId ?? null,
                    workspaceId
                })
            )
        }
        const persistedIds = requestedIds.filter((id) => !snapshotById.has(id))
        const persisted = persistedIds.length
            ? await this.toolsetRepository.find({
                  where: {
                      id: In(persistedIds),
                      ...(request.tenantId ? { tenantId: request.tenantId } : {}),
                      ...(request.organizationId !== undefined
                          ? { organizationId: request.organizationId ?? IsNull() }
                          : {}),
                      ...(workspaceId ? { workspaceId } : request.source === 'mcp' ? { workspaceId: IsNull() } : {})
                  },
                  relations: ['tools']
              })
            : []
        const persistedById = new Map(persisted.map((toolset) => [toolset.id, toolset]))
        return requestedIds.flatMap((id) => {
            const toolset = snapshotById.get(id) ?? persistedById.get(id)
            return toolset ? [toolset] : []
        })
    }

    private attachDeclaredToolAdapters(
        toolset: _BaseToolset<StructuredToolInterface>,
        request: LoadToolsetsRequest,
        defaultHost: ToolHostApi
    ) {
        if (this.#declaredToolAdapters.has(toolset)) return
        const definitions = optionalCapabilityProvider(toolset)?.getMcpCapabilityDefinitions().tools ?? []
        if (!definitions.length) return
        this.#declaredToolAdapters.add(toolset)
        const initialize = toolset.initTools.bind(toolset)
        let augmented: StructuredToolInterface[] | undefined
        toolset.initTools = async () => {
            if (augmented) return augmented
            const initialized = (await initialize()) ?? []
            const names = new Set(initialized.map(({ name }) => name))
            for (const definition of definitions) {
                if (names.has(definition.name)) {
                    throw new ToolProviderNotFoundError(
                        `Declared tool '${definition.name}' duplicates an existing tool in toolset '${toolset.getName()}'`
                    )
                }
                names.add(definition.name)
            }
            const adapters = definitions.map(
                (definition) =>
                    new DynamicStructuredTool({
                        name: definition.name,
                        description: definition.description,
                        schema: definition.inputSchema,
                        responseFormat: 'content_and_artifact',
                        metadata: {
                            title: definition.title,
                            behavior: definition.behavior,
                            exposure: definition.exposure
                        },
                        func: async (input, _runManager, config) => {
                            const context =
                                toolExecutionContextFromConfig(config) ??
                                createDeclaredToolContext(request, defaultHost, config)
                            const result = await this.executeDeclaredTool(definition, input, context)
                            return toLangChainDeclaredToolResult(result)
                        }
                    })
            )
            augmented = [...initialized, ...adapters]
            toolset.tools = augmented
            return augmented
        }
    }

    private async executeDeclaredTool(
        definition: AnyXpertToolDefinition,
        arguments_: unknown,
        context: ToolExecutionContext
    ): Promise<XpertToolResult> {
        const input = await definition.inputSchema.parseAsync(arguments_)
        const result = await definition.execute(input, context)
        if (!definition.outputSchema || result.structuredContent === undefined) return result
        return {
            ...result,
            structuredContent: await definition.outputSchema.parseAsync(result.structuredContent)
        }
    }

    async executeMcpResource(request: ExecuteMcpResourceRequest): Promise<McpResourceReadResult> {
        return this.withCapabilityToolset(request, async (toolset, context) => {
            if (toolset instanceof MCPToolset) {
                return toolset.readMcpResource(request.uri, request.serverName)
            }
            const definitions = requireCapabilityProvider(toolset).getMcpCapabilityDefinitions()
            if (request.capabilityType === 'app') {
                throw capabilityNotFound(request)
            }
            if (request.capabilityType === 'resource') {
                const resource = definitions.resources?.find((item) => item.key === request.capabilityKey)
                if (!resource) throw capabilityNotFound(request)
                return resource.read(context)
            }
            const template = definitions.resourceTemplates?.find((item) => item.key === request.capabilityKey)
            if (!template) throw capabilityNotFound(request)
            return template.read(request.arguments ?? {}, context)
        })
    }

    async executeMcpPrompt(request: ExecuteMcpPromptRequest): Promise<McpPromptResult> {
        return this.withCapabilityToolset(request, async (toolset, context) => {
            if (toolset instanceof MCPToolset) {
                return toolset.getMcpPrompt(request.remoteName ?? request.name, request.arguments, request.serverName)
            }
            const prompt = requireCapabilityProvider(toolset)
                .getMcpCapabilityDefinitions()
                .prompts?.find((item) => item.key === request.capabilityKey)
            if (!prompt) throw capabilityNotFound(request)
            return prompt.get(request.arguments, context)
        })
    }

    async completeMcpCapability(request: CompleteMcpCapabilityRequest): Promise<McpCompletionResult> {
        return this.withCapabilityToolset(request, async (toolset, context) => {
            if (toolset instanceof MCPToolset) {
                return toolset.completeMcpCapability(request.reference, request.argument, request.serverName)
            }
            const definitions = requireCapabilityProvider(toolset).getMcpCapabilityDefinitions()
            const complete =
                request.reference.type === 'resource'
                    ? definitions.resourceTemplates?.find((item) => item.key === request.capabilityKey)?.complete
                    : definitions.prompts?.find((item) => item.key === request.capabilityKey)?.complete
            if (!complete) return { values: [] }
            return complete({ argument: request.argument.name, value: request.argument.value }, context)
        })
    }

    private async withCapabilityToolset<TResult>(
        request: ExecuteMcpCapabilityRequest,
        execute: (
            toolset: _BaseToolset<StructuredToolInterface>,
            context: ToolExecutionContext
        ) => Promise<TResult> | TResult
    ): Promise<TResult> {
        const [toolset] = await this.loadToolsets({ ...request, toolsetIds: [request.toolsetId] })
        if (!toolset) {
            throw new ToolNotFoundError(`Toolset '${request.toolsetId}' was not found in the requested workspace`)
        }
        const context = createToolExecutionContext(
            request,
            this.#runtimeToolsets.get(toolset),
            this.#runtimeHosts.get(toolset)
        )
        try {
            if (!(toolset instanceof MCPToolset)) {
                await toolset.initTools()
            }
            return await execute(toolset, context)
        } finally {
            try {
                await toolset.close()
            } catch (error) {
                this.#logger.debug(error)
            }
        }
    }
}

function createToolExecutionContext(
    request: ExecuteMcpCapabilityRequest,
    toolset: XpertToolset | undefined,
    runtimeHost?: ToolHostApi
): ToolExecutionContext {
    return {
        source: request.source,
        tenantId: request.tenantId,
        organizationId: request.organizationId ?? undefined,
        ...optionalWorkspaceContext(toolsetWorkspaceId(request, toolset)),
        projectId: request.projectId ?? undefined,
        principal: request.principal,
        executionId: request.executionId,
        requestId: request.requestId,
        traceId: request.traceId,
        conversationId: request.conversationId,
        xpertId: request.xpertId ?? undefined,
        agentKey: request.agentKey,
        signal: request.signal,
        host: runtimeHost ?? request.host ?? {}
    }
}

function requireCapabilityProvider(toolset: _BaseToolset<StructuredToolInterface>): McpCapabilityRuntimeProvider {
    if (isCapabilityProvider(toolset)) {
        return toolset
    }
    throw new ToolProviderNotFoundError(`Toolset '${toolset.getName()}' does not provide MCP capability handlers`)
}

function optionalCapabilityProvider(
    toolset: _BaseToolset<StructuredToolInterface>
): McpCapabilityRuntimeProvider | undefined {
    return isCapabilityProvider(toolset) ? toolset : undefined
}

function declaredToolDefinition(toolset: _BaseToolset<StructuredToolInterface>, toolName: string) {
    return optionalCapabilityProvider(toolset)
        ?.getMcpCapabilityDefinitions()
        .tools?.find((definition) => definition.name === toolName)
}

function isCapabilityProvider(
    toolset: _BaseToolset<StructuredToolInterface>
): toolset is _BaseToolset<StructuredToolInterface> & McpCapabilityRuntimeProvider {
    return typeof Reflect.get(toolset, 'getMcpCapabilityDefinitions') === 'function'
}

function capabilityNotFound(request: ExecuteMcpCapabilityRequest) {
    return new ToolNotFoundError(
        `MCP capability '${request.capabilityKey}' was not found in toolset '${request.toolsetId}'`
    )
}

function withAuthoritativeToolsetSource(
    descriptor: McpCapabilityDescriptor,
    toolsetId: string
): McpCapabilityDescriptor {
    return {
        ...descriptor,
        source: {
            ...descriptor.source,
            toolsetId
        }
    }
}

export function normalizeToolResult(value: unknown): XpertToolResult {
    if (typeof value === 'string') {
        return { content: [{ type: 'text', text: value }] }
    }
    if (isToolResultLike(value)) {
        const content = normalizeContent(value.content)
        return {
            ...(content.length ? { content } : {}),
            ...('structuredContent' in value ? { structuredContent: value.structuredContent } : {}),
            ...('_meta' in value && isJsonObject(value._meta) ? { meta: JSON.parse(JSON.stringify(value._meta)) } : {}),
            ...('isError' in value && typeof value.isError === 'boolean' ? { isError: value.isError } : {})
        }
    }
    return { structuredContent: value }
}

function isToolResultLike(value: unknown): value is object & { content?: unknown } {
    return typeof value === 'object' && value !== null && 'content' in value
}

function normalizeContent(value: unknown): XpertToolContent[] {
    if (typeof value === 'string') {
        return [{ type: 'text', text: value }]
    }
    if (!Array.isArray(value)) {
        return []
    }
    return value.flatMap<XpertToolContent>((item) => {
        if (typeof item === 'string') {
            return [{ type: 'text' as const, text: item }]
        }
        if (isTextContent(item)) {
            return [{ type: 'text' as const, text: item.text }]
        }
        if (isMediaContent(item)) {
            return [{ type: item.type, data: item.data, mimeType: item.mimeType }]
        }
        if (isResourceLinkContent(item)) {
            return [{ type: 'resource_link' as const, uri: item.uri, ...(item.name ? { name: item.name } : {}) }]
        }
        return []
    })
}

function isMediaContent(value: unknown): value is { type: 'image' | 'audio'; data: string; mimeType: string } {
    return (
        typeof value === 'object' &&
        value !== null &&
        'type' in value &&
        (value.type === 'image' || value.type === 'audio') &&
        'data' in value &&
        typeof value.data === 'string' &&
        'mimeType' in value &&
        typeof value.mimeType === 'string'
    )
}

function isResourceLinkContent(value: unknown): value is { type: 'resource_link'; uri: string; name?: string } {
    return (
        typeof value === 'object' &&
        value !== null &&
        'type' in value &&
        value.type === 'resource_link' &&
        'uri' in value &&
        typeof value.uri === 'string' &&
        (!('name' in value) || value.name === undefined || typeof value.name === 'string')
    )
}

function isJsonObject(value: unknown) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireToolArguments(value: unknown): Record<string, unknown> {
    if (!isJsonObject(value)) {
        throw new Error(
            toolRuntimeMessage('server-ai:Error.McpToolArgumentsInvalid', 'MCP tool arguments must be an object.')
        )
    }
    return Object.fromEntries(Object.entries(value))
}

function isTextContent(value: unknown): value is { type: 'text'; text: string } {
    return (
        typeof value === 'object' &&
        value !== null &&
        'type' in value &&
        value.type === 'text' &&
        'text' in value &&
        typeof value.text === 'string'
    )
}

function normalizeWorkspaceId(value?: string | null) {
    const workspaceId = value?.trim()
    return workspaceId && workspaceId !== 'null' && workspaceId !== 'undefined' ? workspaceId : null
}

function toolsetWorkspaceId(
    request: Pick<LoadToolsetsRequest, 'source' | 'workspaceId'>,
    toolset?: { workspaceId?: string | null }
) {
    const requestedWorkspaceId = normalizeWorkspaceId(request.workspaceId)
    const persistedWorkspaceId = normalizeWorkspaceId(toolset?.workspaceId)
    if (requestedWorkspaceId && persistedWorkspaceId && requestedWorkspaceId !== persistedWorkspaceId) {
        throw new ToolProviderNotFoundError(
            toolRuntimeMessage(
                'server-ai:Error.McpToolsetWorkspaceMismatch',
                'Toolset is outside the requested workspace context.'
            )
        )
    }
    if (request.source === 'mcp' && !requestedWorkspaceId && persistedWorkspaceId) {
        throw new ToolProviderNotFoundError(
            toolRuntimeMessage(
                'server-ai:Error.McpOrganizationPublicationWorkspaceToolset',
                'Organization-scoped MCP publications cannot execute a workspace-scoped toolset.'
            )
        )
    }
    return requestedWorkspaceId ?? persistedWorkspaceId ?? undefined
}

function optionalWorkspaceContext(workspaceId: string | undefined) {
    return workspaceId ? { workspaceId } : {}
}

function createDeclaredToolContext(
    request: LoadToolsetsRequest,
    host: ToolHostApi,
    config: unknown
): ToolExecutionContext {
    const tenantId = request.tenantId?.trim()
    const workspaceId = request.workspaceId?.trim()
    if (!tenantId) {
        throw new Error(
            toolRuntimeMessage(
                'server-ai:Error.McpDeclaredToolScopeRequired',
                'Declared tools require an explicit tenant context.'
            )
        )
    }
    const requestId = toolCallIdFromConfig(config) ?? randomUUID()
    return {
        source: request.source ?? 'agent',
        tenantId,
        organizationId: request.organizationId,
        ...(workspaceId ? { workspaceId } : {}),
        projectId: request.projectId ?? undefined,
        principal: request.principal,
        executionId: request.executionId ?? requestId,
        requestId,
        conversationId: request.conversationId,
        xpertId: request.xpertId ?? undefined,
        agentKey: request.agentKey,
        signal: request.signal,
        host
    }
}

function toolRuntimeMessage(key: string, defaultValue: string) {
    const message = t(key, { defaultValue })
    return typeof message === 'string' && message ? message : defaultValue
}

function toolExecutionContextFromConfig(config: unknown): ToolExecutionContext | undefined {
    if (!isObject(config)) return undefined
    const configurable = Reflect.get(config, 'configurable')
    if (!isObject(configurable)) return undefined
    const context = Reflect.get(configurable, 'toolExecutionContext')
    return isToolExecutionContext(context) ? context : undefined
}

function toolCallIdFromConfig(config: unknown) {
    if (!isObject(config)) return undefined
    const configurable = Reflect.get(config, 'configurable')
    if (!isObject(configurable)) return undefined
    const value = Reflect.get(configurable, 'tool_call_id')
    return typeof value === 'string' && value ? value : undefined
}

function isToolExecutionContext(value: unknown): value is ToolExecutionContext {
    if (!isObject(value)) return false
    const source = Reflect.get(value, 'source')
    const principal = Reflect.get(value, 'principal')
    return (
        (source === 'agent' || source === 'mcp' || source === 'workflow' || source === 'api') &&
        typeof Reflect.get(value, 'tenantId') === 'string' &&
        (Reflect.get(value, 'workspaceId') === undefined || typeof Reflect.get(value, 'workspaceId') === 'string') &&
        typeof Reflect.get(value, 'executionId') === 'string' &&
        typeof Reflect.get(value, 'requestId') === 'string' &&
        isToolPrincipal(principal) &&
        isObject(Reflect.get(value, 'host'))
    )
}

function isToolPrincipal(value: unknown): value is ToolPrincipal {
    if (!isObject(value)) return false
    const type = Reflect.get(value, 'type')
    return (type === 'user' || type === 'service_account') && typeof Reflect.get(value, 'id') === 'string'
}

function toLangChainDeclaredToolResult(result: XpertToolResult): [string, XpertToolResult] {
    const text = result.content
        ?.filter((item): item is Extract<XpertToolContent, { type: 'text' }> => item.type === 'text')
        .map(({ text }) => text)
        .filter(Boolean)
        .join('\n')
    const fallback = text || serializeStructuredContent(result.structuredContent) || 'Tool completed.'
    return [fallback, result]
}

function serializeStructuredContent(value: unknown) {
    if (value === undefined) return ''
    try {
        return JSON.stringify(value)
    } catch {
        return ''
    }
}

function isObject(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createToolCredentialsApi(credentials: unknown): ToolCredentialsApi {
    return {
        async get<TValue extends JSONValue = JSONValue>(key: string): Promise<TValue | null> {
            if (!isObject(credentials) || !Object.prototype.hasOwnProperty.call(credentials, key)) return null
            const value = Reflect.get(credentials, key)
            if (!isJsonValue(value)) return null
            return JSON.parse(JSON.stringify(value)) as TValue
        }
    }
}

function isJsonValue(value: unknown): value is JSONValue {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return true
    }
    if (Array.isArray(value)) return value.every(isJsonValue)
    return isObject(value) && Object.values(value).every(isJsonValue)
}
