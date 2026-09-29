// Native Apps use the same sandbox, token and RPC boundary as remote MCP Apps.
// Re-resolve the connected middleware on every RPC; a saved App is not a permanent tool grant.
import { DynamicStructuredTool } from '@langchain/core/tools'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { Injectable, ForbiddenException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import {
    ChatMessageEventTypeEnum,
    WorkflowNodeTypeEnum,
    isMiddlewareToolEnabled,
    type IWFNMiddleware,
    type TMcpToolAppMeta
} from '@xpert-ai/contracts'
import {
    AgentMiddlewareRegistry,
    RequestContext,
    type AgentMiddleware,
    type IAgentMiddlewareContext
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { z } from 'zod'
import { toJsonSchema } from '@langchain/core/utils/json_schema'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime/middleware-runtime.service'
import { getRuntimeEnabledMiddlewareNodes } from '../shared/agent/middleware'
import { resolveToolRuntimeScope } from '../tool-runtime/workspace-scope'
import { GetXpertWorkflowQuery, type TXpertWorkflowQueryOutput } from '../xpert/queries/get-xpert-workflow.query'
import { McpAppBundleService } from '../mcp-publication/mcp-app-bundle.service'
import {
    createMcpToolAppMeta,
    registerMcpAppInstance,
    buildMcpAppComponentMessage,
    normalizeMcpAppToolResult,
    restoreMcpAppInstance,
    waitForMcpAppInstancePersistence
} from '../xpert-toolset/provider/mcp/app-support'
import { mcpConsumerCallToolResultSchema } from '../mcp-consumer/tools/mcp-consumer-call-tool-result'
import { readMcpAppExecutionContext } from './mcp-app-execution-context'
import type { McpAppInstanceSnapshot } from './mcp-app-instance-store.service'
import type { MiddlewareAppBackend, MiddlewareAppSource } from './middleware-app-source'

type AppContext = Omit<IAgentMiddlewareContext, 'tools' | 'runtime' | 'store'>
const modelContextSchema = z.object({
    updatedAt: z.number().finite(),
    content: z.unknown().optional(),
    structuredContent: z.record(z.unknown()).optional()
})

@Injectable()
export class MiddlewareMcpAppsService {
    constructor(
        private readonly registry: AgentMiddlewareRegistry,
        private readonly queryBus: QueryBus,
        private readonly runtime: AgentMiddlewareRuntimeService,
        private readonly bundles: McpAppBundleService
    ) {}

    bind(
        middleware: AgentMiddleware,
        context: IAgentMiddlewareContext,
        options: { interruptAfter?: string[]; isDraft?: boolean }
    ): AgentMiddleware {
        if (!middleware.apps) return middleware
        const strategy = this.registry.get(context.node.provider)
        const provenance = this.registry.getSource(strategy)
        if (provenance.kind !== 'plugin') throw this.denied()
        const { tools: _tools, runtime: _runtime, store: _store, ...identity } = context
        const sourceBase = {
            kind: 'middleware' as const,
            provider: context.node.provider,
            nodeKey: context.node.key,
            agentKey: context.agentKey,
            pluginName: provenance.pluginName,
            isDraft: options.isDraft
        }
        const bindings = middleware.apps.tools
        return {
            ...middleware,
            tools: (middleware.tools ?? [])
                .filter((tool) => !bindings[tool.name] || bindings[tool.name].visibility.includes('model'))
                .map((tool) => {
                    const binding = bindings[tool.name]
                    if (!binding?.resourceKey) return tool
                    const source: MiddlewareAppSource = {
                        ...sourceBase,
                        interruptAfter: options.interruptAfter?.includes(tool.name) ?? false
                    }
                    const app = middleware.apps.definitions.find((item) => item.key === binding.resourceKey)
                    if (!app || !binding.visibility.includes('app')) throw this.denied()
                    return new DynamicStructuredTool({
                        name: tool.name,
                        description: tool.description,
                        schema: tool.schema,
                        metadata: { ...tool.metadata, middlewareMcpApp: true },
                        responseFormat: tool.responseFormat,
                        returnDirect: tool.returnDirect,
                        verboseParsingErrors: true,
                        func: async (input, manager, config) => {
                            const result = await tool.func(input, manager, config)
                            const executionId = config?.configurable?.executionId
                            const toolCallId = config?.metadata?.tool_call_id ?? config?.configurable?.tool_call_id
                            const executionContext = readMcpAppExecutionContext({ ...identity, executionId })
                            if (!executionContext || typeof toolCallId !== 'string') throw this.denied()
                            const backend = this.backend(source, identity)
                            const toolMeta = this.metadata(source, tool, middleware)
                            const data = registerMcpAppInstance({
                                middleware: backend,
                                userId: context.userId,
                                executionContext,
                                toolset: this.scope(identity),
                                tool,
                                toolMeta,
                                toolCallId,
                                toolInput: input,
                                toolResult: result
                            })
                            if (!data) throw this.denied()
                            data.executionId = executionContext.executionId
                            await waitForMcpAppInstancePersistence(data.appInstanceId)
                            await dispatchCustomEvent(
                                ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
                                buildMcpAppComponentMessage(data)
                            )
                            return result
                        }
                    })
                })
        }
    }

    async restore(snapshot: McpAppInstanceSnapshot) {
        if (!snapshot.source || !snapshot.executionContext) throw this.denied()
        const identity: AppContext = {
            ...snapshot.executionContext,
            tenantId: snapshot.tenantId,
            organizationId: snapshot.organizationId,
            workspaceId: snapshot.workspaceId,
            userId: snapshot.userId,
            agentKey: snapshot.source.agentKey,
            node: {
                id: snapshot.source.nodeKey,
                key: snapshot.source.nodeKey,
                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                provider: snapshot.source.provider
            }
        }
        const { middleware } = await this.resolve(snapshot.source, identity)
        const tool = middleware.tools?.find((item) => item.name === snapshot.toolName)
        if (!tool) throw this.denied()
        const toolMeta = this.metadata(snapshot.source, tool, middleware)
        if (toolMeta.ui?.resourceUri !== snapshot.resourceUri) throw this.denied()
        const modelContext = modelContextSchema.safeParse(snapshot.modelContext)
        return restoreMcpAppInstance({
            ...snapshot,
            id: snapshot.appInstanceId,
            middleware: this.backend(snapshot.source, identity),
            toolset: this.scope(identity),
            toolMeta,
            modelContext: modelContext.success
                ? { ...modelContext.data, updatedAt: modelContext.data.updatedAt }
                : undefined
        })
    }

    private backend(source: MiddlewareAppSource, identity: AppContext): MiddlewareAppBackend {
        return {
            source,
            assertAccess: async () => {
                await this.resolve(source, identity)
            },
            listTools: async () => {
                const { middleware } = await this.resolve(source, identity)
                return (middleware.tools ?? [])
                    .filter((tool) => middleware.apps.tools[tool.name]?.visibility.includes('app'))
                    .map((tool) => this.metadata(source, tool, middleware))
            },
            requiresApproval: async (name) => {
                const { middleware } = await this.resolve(source, identity)
                return middleware.apps.tools[name]?.approval !== 'none'
            },
            readResource: async (uri) => {
                const { middleware } = await this.resolve(source, identity)
                const app = middleware.apps.definitions.find((item) => this.resourceUri(source, item.key) === uri)
                if (!app) throw this.denied()
                return {
                    contents: [
                        await this.bundles.readForScope(
                            identity,
                            {
                                ...app,
                                source: { pluginName: source.pluginName }
                            },
                            uri
                        )
                    ]
                }
            },
            callTool: async (name, args) => {
                const { middleware } = await this.resolve(source, identity)
                const tool = middleware.tools?.find((item) => item.name === name)
                if (!tool || !middleware.apps.tools[name]?.visibility.includes('app')) throw this.denied()
                const output = await tool.invoke(args, {
                    configurable: { thread_id: identity.threadId, context: { mcpApp: { source: 'middleware' } } }
                })
                return mcpConsumerCallToolResultSchema.parse(normalizeMcpAppToolResult(output))
            }
        }
    }

    private async resolve(source: MiddlewareAppSource, identity: AppContext) {
        if (
            identity.userId !== RequestContext.currentUserId() ||
            identity.tenantId !== RequestContext.currentTenantId() ||
            identity.organizationId !== RequestContext.getOrganizationId()
        )
            throw this.denied()
        const { agent, graph } = await this.queryBus.execute<GetXpertWorkflowQuery, TXpertWorkflowQueryOutput>(
            new GetXpertWorkflowQuery(identity.xpertId, source.agentKey, source.isDraft)
        )
        const node = getRuntimeEnabledMiddlewareNodes(graph, agent).find((item) => item.key === source.nodeKey)
        if (
            !node ||
            node.type !== 'workflow' ||
            node.entity.type !== WorkflowNodeTypeEnum.MIDDLEWARE ||
            !('provider' in node.entity) ||
            node.entity.provider !== source.provider ||
            agent.team.workspaceId !== identity.workspaceId
        )
            throw this.denied()
        const entity = node.entity as IWFNMiddleware
        const strategy = this.registry.get(source.provider, identity.organizationId)
        const provenance = this.registry.getSource(strategy)
        if (provenance.kind !== 'plugin' || provenance.pluginName !== source.pluginName) throw this.denied()
        const runtimeScope = resolveToolRuntimeScope(identity, agent.team.workspaceDataScope)
        const context: IAgentMiddlewareContext = {
            ...identity,
            node: entity,
            xpertFeatures: agent.team.features,
            tools: new Map(),
            runtime: this.runtime.createScopedApi({ ...identity, ...runtimeScope })
        }
        const middleware = await strategy.createMiddleware(entity.options, context)
        if (!middleware.apps) throw this.denied()
        middleware.tools = (middleware.tools ?? []).filter((tool) => isMiddlewareToolEnabled(entity.tools?.[tool.name]))
        return { middleware, context }
    }

    private metadata(
        source: MiddlewareAppSource,
        tool: DynamicStructuredTool,
        middleware: AgentMiddleware
    ): TMcpToolAppMeta {
        const binding = middleware.apps.tools[tool.name]
        const app = middleware.apps.definitions.find((item) => item.key === binding?.resourceKey)
        return createMcpToolAppMeta(source.provider, tool.name, {
            name: tool.name,
            description: tool.description,
            inputSchema: toJsonSchema(tool.schema),
            _meta: {
                ui: {
                    visibility: [...(binding?.visibility ?? ['model'])],
                    ...(app ? { resourceUri: this.resourceUri(source, app.key), title: app.title } : {})
                }
            }
        })
    }
    private resourceUri(source: MiddlewareAppSource, key: string) {
        return `ui://xpert/middleware/${encodeURIComponent(source.pluginName)}/${encodeURIComponent(source.provider)}/${encodeURIComponent(key)}`
    }
    private scope(identity: AppContext) {
        return {
            id: undefined,
            name: identity.node.provider,
            tenantId: identity.tenantId,
            organizationId: identity.organizationId,
            workspaceId: identity.workspaceId
        }
    }
    private denied() {
        return new ForbiddenException(
            t('server-ai:Error.MiddlewareAppUnavailable', {
                defaultValue: 'This middleware App is no longer available in the current assistant scope.'
            })
        )
    }
}
