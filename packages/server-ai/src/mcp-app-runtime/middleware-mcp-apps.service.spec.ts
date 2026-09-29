import { QueryBus } from '@nestjs/cqrs'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import {
    RequestContext,
    AgentMiddlewareRegistry,
    type AgentMiddleware,
    type IAgentMiddlewareContext
} from '@xpert-ai/plugin-sdk'
import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { MiddlewareMcpAppsService } from './middleware-mcp-apps.service'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime/middleware-runtime.service'
import { McpAppBundleService } from '../mcp-publication/mcp-app-bundle.service'
import type { McpAppInstanceSnapshot } from './mcp-app-instance-store.service'

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
    const graph = {
        nodes: [{ key: node.key, type: 'workflow', entity: node }],
        connections: [{ from: 'Main', to: node.key, type: 'workflow' }]
    }
    const strategy = { createMiddleware: jest.fn(async () => ({ ...middleware, tools: [...middleware.tools] })) }
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
    const runtime = { createScopedApi: jest.fn(() => ({})) }
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
    return { service, context, middleware, snapshot, graph, node, registry, runtime, bundles, submit }
}
describe('middleware MCP Apps boundary', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
    })
    afterEach(() => jest.restoreAllMocks())
    it('exposes the entry tool to the model while hiding App-only mutation tools', () => {
        const f = fixture()
        const bound = f.service.bind(f.middleware, f.context, { interruptAfter: ['configure'] })
        expect(bound.tools.map((item) => item.name)).toEqual(['configure'])
        expect(bound.tools[0].metadata.middlewareMcpApp).toBe(true)
        expect(f.submit).not.toHaveBeenCalled()
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
})
