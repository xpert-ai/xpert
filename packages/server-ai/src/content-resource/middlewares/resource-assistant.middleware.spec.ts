jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn() }))
import { Test } from '@nestjs/testing'
import { DiscoveryModule } from '@nestjs/core'
import { CommandBus } from '@nestjs/cqrs'
import { AgentMiddlewareRegistry, StrategyBus, type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import {
    isUserAddableAgentMiddleware,
    type IWFNMiddleware,
    type TXpertTeamNode,
    type IXpertAgent,
    type TXpertGraph,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { getAgentMiddlewares } from '../../shared/agent/middleware'
import { createResourceNavigationTools } from '../../shared/agent/resource-navigation/tools'
import type { TXpertAgentRuntimeOptions } from '../../shared/agent/state'
import { ConversationResourceService } from '../discovery/conversation-resource.service'
import { ContentEditorsService } from '../content-editors.service'
import { ResourceAssistantMiddleware } from './resource-assistant.middleware'
import { RESOURCE_ASSISTANT_MIDDLEWARE } from '../resource-assistant.constants'

async function fixture() {
    const execute = jest.fn().mockResolvedValue({ scope: 'project' })
    const list = jest.fn().mockResolvedValue({ items: [], nextCursor: null, sharedAvailable: false })
    const resolve = jest.fn()
    const module = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [
            ResourceAssistantMiddleware,
            AgentMiddlewareRegistry,
            StrategyBus,
            { provide: CommandBus, useValue: { execute } },
            { provide: ConversationResourceService, useValue: { list } },
            { provide: ContentEditorsService, useValue: { resolve } }
        ]
    }).compile()
    await module.init()
    const middleware = module.get(ResourceAssistantMiddleware)
    const registry = module.get(AgentMiddlewareRegistry)
    const context: Omit<IAgentMiddlewareContext, 'node'> = {
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'human',
        projectId: 'project',
        conversationId: 'conversation',
        xpertId: 'assistant',
        threadId: 'thread',
        tools: new Map(),
        runtime: { createModelClient: jest.fn(), wrapWorkflowNodeExecution: jest.fn() }
    }
    const node: TXpertTeamNode<'workflow'> & { entity: IWFNMiddleware } = {
        key: 'resources',
        type: 'workflow',
        position: { x: 0, y: 0 },
        entity: {
            id: 'resources',
            key: 'resources',
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            provider: RESOURCE_ASSISTANT_MIDDLEWARE
        }
    }
    const graph = {
        nodes: [node],
        connections: [{ key: 'link', type: 'workflow', from: 'agent', to: node.key }]
    } as TXpertGraph
    const run = (options?: TXpertAgentRuntimeOptions, selectedGraph = graph) =>
        getAgentMiddlewares(selectedGraph, { key: 'agent' } as IXpertAgent, registry, context, options)
    return { module, middleware, registry, context, graph, node, run, execute, list, resolve }
}

it('registers a user-addable capability but injects nothing into an unconfigured Agent', async () => {
    const f = await fixture()
    expect(f.registry.get(RESOURCE_ASSISTANT_MIDDLEWARE)).toBe(f.middleware)
    expect(isUserAddableAgentMiddleware(f.middleware.meta)).toBe(true)
    expect(f.middleware.getToolNames()).toEqual(['resource_search', 'resource_open'])
    expect(await f.run(undefined, { ...f.graph, connections: [] })).toEqual([])
    expect(f.execute).not.toHaveBeenCalled()
    await f.module.close()
})

it('selects Project navigation through the regular middleware path without querying content during assembly', async () => {
    const f = await fixture()
    const entries = await f.run()
    expect(entries[0].tools.map((tool) => tool.name)).toEqual(['resource_search', 'resource_open'])
    expect(f.list).not.toHaveBeenCalled()
    await entries[0].tools[0].invoke({ query: 'Inventory' })
    expect(f.list).toHaveBeenCalledWith(
        expect.objectContaining({
            projectId: 'project',
            actor: {
                tenantId: 'tenant',
                organizationId: 'org',
                userId: 'human'
            }
        }),
        expect.objectContaining({ search: 'Inventory' })
    )
    await f.module.close()
})

it('honors runtime plugin selection and the explicit required-node policy', async () => {
    const f = await fixture()
    const runtimeCapabilities = { mode: 'allowlist' as const, skills: { ids: [] }, plugins: { nodeKeys: [] } }
    expect(await f.run({ runtimeCapabilities })).toEqual([])
    expect(f.execute).not.toHaveBeenCalled()
    expect(
        await f.run({ runtimeCapabilities: { ...runtimeCapabilities, plugins: { nodeKeys: ['resources'] } } })
    ).toHaveLength(1)
    f.node.entity.required = true
    expect(await f.run({ runtimeCapabilities })).toHaveLength(1)
    await f.module.close()
})

it.each(['project', 'group'] as const)('honors configured and per-user disabled tools in %s scope', async (scope) => {
    const f = await fixture()
    const groupTools = createResourceNavigationTools({ search: jest.fn(), present: jest.fn() })
    f.execute.mockResolvedValue(scope === 'group' ? { scope, tools: groupTools } : { scope })
    f.node.entity.tools = { resource_search: false }
    const entries = await f.run({
        toolPreferences: {
            version: 1,
            middlewares: {
                resources: { provider: RESOURCE_ASSISTANT_MIDDLEWARE, disabledTools: ['resource_open'] }
            }
        }
    })
    expect(entries[0].tools).toEqual([])
    expect(f.list).not.toHaveBeenCalled()
    await f.module.close()
})

it('keeps group adapters scoped, including empty toolsets; never falls back after denial', async () => {
    const f = await fixture()
    const search = jest.fn().mockResolvedValue({ items: [], nextCursor: null, sharedAvailable: false })
    const tools = createResourceNavigationTools({ search, present: jest.fn() })
    f.execute.mockResolvedValue({ scope: 'group', tools })
    await (await f.run())[0].tools[0].invoke({ query: 'Inventory' })
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ search: 'Inventory', origin: 'all', limit: 10 }))
    expect(f.list).not.toHaveBeenCalled()
    f.execute.mockResolvedValue({ scope: 'group', tools: [] })
    expect((await f.run())[0].tools).toEqual([])
    f.execute.mockRejectedValue(new Error('revoked'))
    await expect(f.run()).rejects.toThrow('revoked')
    expect(f.list).not.toHaveBeenCalled()
    expect(f.resolve).not.toHaveBeenCalled()
    await f.module.close()
})

it('cannot override routing or authority through middleware options', async () => {
    const f = await fixture()
    const context: IAgentMiddlewareContext = {
        ...f.context,
        node: {
            id: 'resources',
            key: 'resources',
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            provider: RESOURCE_ASSISTANT_MIDDLEWARE
        }
    }
    await expect(f.middleware.createMiddleware({ projectId: 'other' }, context)).rejects.toThrow()
    await expect(f.middleware.createMiddleware(null, context)).rejects.toThrow()
    expect(f.execute).not.toHaveBeenCalled()
    await f.module.close()
})
