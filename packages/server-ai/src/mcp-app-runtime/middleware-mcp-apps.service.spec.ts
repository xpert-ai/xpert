import { QueryBus } from '@nestjs/cqrs'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import {
    RequestContext,
    AgentMiddlewareRegistry,
    ConnectorRuntimeCapability,
    DefaultRuntimeCapabilityRegistry,
    type AgentMiddleware,
    type AgentMiddlewareRuntimeScope,
    type IAgentMiddlewareContext
} from '@xpert-ai/plugin-sdk'
import { WorkflowNodeTypeEnum, type TXpertGraph, type IWFNMiddleware } from '@xpert-ai/contracts'
import { MiddlewareMcpAppsService } from './middleware-mcp-apps.service'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime/middleware-runtime.service'
import { McpAppBundleService } from '../mcp-publication/mcp-app-bundle.service'
import type { McpAppInstanceSnapshot } from './mcp-app-instance-store.service'
import { registerMcpAppInstance } from '../xpert-toolset/provider/mcp/app-support'

jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn(async () => undefined) }))

jest.mock('../xpert-toolset/provider/mcp/app-support', () => ({
    createMcpToolAppMeta: (serverName, displayName, tool) => ({
        serverName,
        displayName,
        name: tool.name,
        inputSchema: tool.inputSchema,
        visibility: tool._meta.ui.visibility,
        ui: tool._meta.ui
    }),
    restoreMcpAppInstance: (input) => input,
    registerMcpAppInstance: jest.fn(() => ({ appInstanceId: 'new-app' })),
    waitForMcpAppInstancePersistence: jest.fn(async () => undefined),
    buildMcpAppComponentMessage: (data) => ({ data }),
    normalizeMcpAppToolResult: (output) => ({ content: [{ type: 'text', text: output }] })
}))

function fixture() {
    const submit = jest.fn(async (input: { pages: number }) => JSON.stringify(input))
    const middleware: AgentMiddleware = {
        name: 'Settings',
        tools: [
            tool(async () => 'form', { name: 'configure', description: 'Configure', schema: z.object({}) }),
            tool(submit, {
                name: 'save',
                description: 'Save',
                schema: z.object({ pages: z.number().positive() }).strict()
            })
        ],
        apps: {
            definitions: [{ key: 'settings', entry: 'dist/app.html' }],
            tools: {
                configure: { resourceKey: 'settings', visibility: ['model', 'app'] },
                save: { visibility: ['app'], approval: 'none' }
            }
        }
    }
    const node = {
        id: 'settings-node',
        key: 'settings-node',
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        provider: 'Settings'
    }
    const graph: TXpertGraph = {
        nodes: [{ key: node.key, type: 'workflow', entity: node, position: { x: 0, y: 0 } }],
        connections: [{ key: `Main/${node.key}`, from: 'Main', to: node.key, type: 'workflow' }]
    }
    const strategy = {
        createMiddleware: jest.fn(async (_options: unknown, _context: IAgentMiddlewareContext) => ({
            ...middleware,
            tools: [...middleware.tools]
        }))
    }
    const registry = {
        get: jest.fn(() => strategy),
        getSource: jest.fn(() => ({ kind: 'plugin', pluginName: 'test-plugin' }))
    }
    const query = {
        execute: jest.fn(async () => ({ agent: { key: 'Main', team: { workspaceId: 'workspace' } }, graph }))
    }
    const context = {
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'user',
        workspaceId: 'workspace',
        xpertId: 'assistant',
        projectId: 'project',
        conversationId: 'conversation',
        threadId: 'thread',
        agentKey: 'Main',
        node,
        tools: new Map(),
        runtime: {}
    } as IAgentMiddlewareContext
    const runtime = {
        createScopedApi: jest.fn((_scope: AgentMiddlewareRuntimeScope) => ({
            capabilities: new DefaultRuntimeCapabilityRegistry()
        }))
    }
    const bundles = {
        readForScope: jest.fn(async () => ({
            uri: 'ui://test',
            text: '<html/>',
            mimeType: 'text/html;profile=mcp-app'
        }))
    }
    const service = new MiddlewareMcpAppsService(
        registry as unknown as AgentMiddlewareRegistry,
        query as unknown as QueryBus,
        runtime as unknown as AgentMiddlewareRuntimeService,
        bundles as unknown as McpAppBundleService
    )
    const snapshot: McpAppInstanceSnapshot = {
        version: 1,
        stateVersion: 1,
        appInstanceId: 'app',
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'user',
        workspaceId: 'workspace',
        executionContext: {
            xpertId: 'assistant',
            projectId: 'project',
            conversationId: 'conversation',
            executionId: 'run',
            threadId: 'thread'
        },
        source: {
            kind: 'middleware',
            provider: 'Settings',
            nodeKey: node.key,
            agentKey: 'Main',
            pluginName: 'test-plugin',
            interruptAfter: true
        },
        serverName: 'Settings',
        toolName: 'configure',
        displayName: 'configure',
        resourceUri: 'ui://xpert/middleware/test-plugin/Settings/settings',
        toolCallId: 'call',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60000
    }
    return { service, context, middleware, snapshot, graph, node, registry, runtime, bundles, submit, strategy }
}

function addConnector(graph: TXpertGraph, key: string, provider: string, bindingId?: string) {
    const entity: IWFNMiddleware = {
        id: key,
        key,
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        provider: 'ConnectorMiddleware',
        options: { provider, ...(bindingId ? { connectorId: bindingId } : {}) }
    }
    graph.nodes.push({ key, type: 'workflow', entity, position: { x: 0, y: 0 } })
    graph.connections.push({ key: `Main/${key}`, from: 'Main', to: key, type: 'workflow' })
}

function useConnectorTool(f: ReturnType<typeof fixture>, bindingId?: string) {
    const credentialRead = jest.fn()
    f.runtime.createScopedApi.mockImplementation((scope) => ({
        capabilities: new DefaultRuntimeCapabilityRegistry().register(ConnectorRuntimeCapability, {
            getConnector: async () => {
                throw new Error('Legacy credentials are not used')
            },
            getConnectorCredential: async (input) => {
                if (!scope.conversationId || !scope.executionId) throw new Error('execution_scope_required')
                const granted = input.bindingId
                    ? scope.connectorBindingIds?.includes(input.bindingId)
                    : Boolean(input.provider && scope.connectorProviders?.includes(input.provider))
                if (!granted) throw new Error('connector_access_denied')
                credentialRead(scope)
                return {
                    connectorId: input.bindingId ?? 'amap-1',
                    bindingId: input.bindingId ?? 'amap-1',
                    scope: { type: 'workspace', workspaceId: 'workspace' },
                    authorizationMode: 'shared',
                    provider: 'amap',
                    authMethodId: 'api-key',
                    credentials: { apiKey: 'test-only' }
                }
            }
        })
    }))
    f.strategy.createMiddleware.mockImplementation(async (_options, context) => ({
        ...f.middleware,
        tools: [
            f.middleware.tools[0],
            tool(
                async () => {
                    const connector = context.runtime.capabilities?.get(ConnectorRuntimeCapability)
                    if (!connector?.getConnectorCredential) throw new Error('Connector capability unavailable')
                    const result = await connector.getConnectorCredential({
                        provider: 'amap',
                        ...(bindingId ? { bindingId } : {})
                    })
                    return result.provider
                },
                { name: 'save', description: 'Read scoped map data', schema: z.object({}).strict() }
            )
        ]
    }))
    return credentialRead
}
describe('middleware MCP Apps boundary', () => {
    beforeEach(() => {
        jest.mocked(registerMcpAppInstance).mockClear()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
    })
    afterEach(() => jest.restoreAllMocks())
    it('defaults options when restoring Apps from a historical published node', async () => {
        const f = fixture()
        f.strategy.createMiddleware.mockImplementation(async (options, context) => {
            z.object({}).strict().parse(options)
            expect(context.node.options).toBe(options)
            return { ...f.middleware, tools: [...f.middleware.tools] }
        })
        const app = await f.service.restore(f.snapshot)
        await expect(app.middleware.callTool('save', { pages: 12 })).resolves.toMatchObject({
            content: [{ text: '{"pages":12}' }]
        })
        expect(f.strategy.createMiddleware).toHaveBeenCalledWith(
            {},
            expect.objectContaining({ node: { ...f.node, options: {} } })
        )
        expect(f.node).not.toHaveProperty('options')
    })

    it.each([null, false, '', [], { unexpected: true }].map((options) => ({ options })))(
        'preserves invalid options on App restoration: $options',
        async ({ options }) => {
            const f = fixture()
            Object.assign(f.node, { options })
            f.strategy.createMiddleware.mockImplementation(async (value, context) => {
                expect(context.node.options).toBe(value)
                z.object({}).strict().parse(value)
                return { ...f.middleware, tools: [...f.middleware.tools] }
            })
            await expect(f.service.restore(f.snapshot)).rejects.toBeInstanceOf(z.ZodError)
            expect(f.submit).not.toHaveBeenCalled()
        }
    )

    it('exposes the entry tool to the model while hiding App-only mutation tools', () => {
        const f = fixture()
        const bound = f.service.bind(f.middleware, f.context, { interruptAfter: ['configure'] })
        expect(bound.tools.map((item) => item.name)).toEqual(['configure'])
        expect(bound.tools[0].metadata.middlewareMcpApp).toBe(true)
        expect(f.submit).not.toHaveBeenCalled()
    })
    it('keeps the invoking execution on a new App callback before snapshot restoration', async () => {
        const f = fixture()
        addConnector(f.graph, 'amap', 'amap', 'amap-1')
        const credentialRead = useConnectorTool(f, 'amap-1')
        expect(f.context.executionId).toBeUndefined()
        const bound = f.service.bind(f.middleware, f.context, {
            connectorGrants: { bindingIds: ['amap-1'], providers: [] }
        })
        await bound.tools[0].invoke(
            {},
            {
                configurable: { executionId: 'new-run' },
                metadata: { tool_call_id: 'new-call' }
            }
        )
        const backend = jest.mocked(registerMcpAppInstance).mock.calls[0][0].middleware
        if (!backend) throw new Error('App middleware backend was not registered')
        await expect(backend.callTool('save', {})).resolves.toMatchObject({ content: [{ text: 'amap' }] })
        expect(credentialRead).toHaveBeenCalledWith(
            expect.objectContaining({
                conversationId: 'conversation',
                executionId: 'new-run',
                connectorBindingIds: ['amap-1']
            })
        )
        expect(credentialRead.mock.calls[0][0]).not.toHaveProperty('viewHost')
    })
    it('restores native Apps with their project/thread scope and validates App tool schemas', async () => {
        const f = fixture(),
            app = await f.service.restore(f.snapshot)
        const tools = await app.middleware.listTools()
        expect(tools.find((item) => item.name === 'save').inputSchema).toMatchObject({ required: ['pages'] })
        await expect(app.middleware.callTool('save', { pages: 12 })).resolves.toMatchObject({
            content: [{ text: '{"pages":12}' }]
        })
        await expect(app.middleware.callTool('save', { pages: -1 })).rejects.toThrow()
        await expect(app.middleware.callTool('unbound', {})).rejects.toThrow()
        expect(f.runtime.createScopedApi).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 'project', threadId: 'thread' })
        )
        await expect(app.middleware.readResource('ui://another')).rejects.toThrow()
    })
    it('revalidates graph access for every call instead of retaining a permanent grant', async () => {
        const f = fixture(),
            app = await f.service.restore(f.snapshot)
        f.graph.connections = []
        await expect(app.middleware.callTool('save', { pages: 12 })).rejects.toThrow()
        expect(f.submit).not.toHaveBeenCalled()
    })
    it('rejects a different owner and replaced plugin provenance', async () => {
        const f = fixture()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('other')
        await expect(f.service.restore(f.snapshot)).rejects.toThrow()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        f.registry.getSource.mockReturnValue({ kind: 'plugin', pluginName: 'replacement' })
        await expect(f.service.restore(f.snapshot)).rejects.toThrow()
    })
    it('restores only the exact connector binding granted to the original run and revokes disconnected nodes', async () => {
        const f = fixture()
        addConnector(f.graph, 'amap-node', 'amap', 'amap-1')
        f.snapshot.source.connectorGrants = { bindingIds: ['amap-1'], providers: [] }
        const credentialRead = useConnectorTool(f, 'amap-1')
        const app = await f.service.restore(f.snapshot)
        await expect(app.middleware.callTool('save', {})).resolves.toMatchObject({ content: [{ text: 'amap' }] })
        expect(credentialRead).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant',
                organizationId: 'org',
                userId: 'user',
                workspaceId: 'workspace',
                projectId: 'project',
                connectorBindingIds: ['amap-1'],
                connectorProviders: []
            })
        )
        f.graph.connections = f.graph.connections.filter(({ to }) => to !== 'amap-node')
        await expect(app.middleware.callTool('save', {})).rejects.toThrow('connector_access_denied')
        expect(credentialRead).toHaveBeenCalledTimes(1)
    })
    it('does not grant newly connected optional connectors or replace an original pinned binding', async () => {
        const f = fixture()
        addConnector(f.graph, 'amap-node', 'amap', 'replacement')
        f.snapshot.source.connectorGrants = { bindingIds: ['amap-1'], providers: [] }
        const credentialRead = useConnectorTool(f, 'replacement')
        const app = await f.service.restore(f.snapshot)
        await expect(app.middleware.callTool('save', {})).rejects.toThrow('connector_access_denied')
        expect(credentialRead).not.toHaveBeenCalled()
    })
    it('restores explicitly granted provider lookup without authorizing unrelated providers', async () => {
        const f = fixture()
        addConnector(f.graph, 'amap-node', 'amap')
        addConnector(f.graph, 'unselected-node', 'tencent-map')
        f.snapshot.source.connectorGrants = { bindingIds: [], providers: ['amap'] }
        const credentialRead = useConnectorTool(f)
        const app = await f.service.restore(f.snapshot)
        await expect(app.middleware.callTool('save', {})).resolves.toMatchObject({ content: [{ text: 'amap' }] })
        expect(credentialRead).toHaveBeenCalledWith(
            expect.objectContaining({
                connectorBindingIds: [],
                connectorProviders: ['amap']
            })
        )
    })
    it('fails closed for legacy Apps without original connector grants even with connected graph nodes', async () => {
        const f = fixture()
        addConnector(f.graph, 'amap-node', 'amap')
        const credentialRead = useConnectorTool(f)
        const app = await f.service.restore(f.snapshot)
        await expect(app.middleware.callTool('save', {})).rejects.toThrow('connector_access_denied')
        expect(credentialRead).not.toHaveBeenCalled()
    })
})
