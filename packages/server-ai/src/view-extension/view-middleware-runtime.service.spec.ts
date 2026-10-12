import { ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { CommandBus } from '@nestjs/cqrs'
import {
    WorkflowNodeTypeEnum,
    XpertTypeEnum,
    type IWFNMiddleware,
    type TXpertGraph,
    type TXpertTeamNode,
    type XpertResolvedViewHostContext
} from '@xpert-ai/contracts'
import {
    AgentMiddlewareRegistry,
    DefaultRuntimeCapabilityRegistry,
    RequestContext,
    ViewMiddlewareRuntimeCapability,
    type AgentMiddlewareRuntimeApi,
    type AgentMiddlewareRuntimeScope
} from '@xpert-ai/plugin-sdk'
import { Xpert } from '../xpert/xpert.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { XpertProjectXpertBindingService } from '../xpert-project/services/project-xpert-binding.service'
import { VOLUME_CLIENT } from '../shared/volume'
import { XpertAgent } from '../xpert-agent/xpert-agent.entity'
import { XpertService } from '../xpert/xpert.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertProfileIdentityService } from '../xpert/xpert-profile-identity.service'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime/middleware-runtime.service'
import { AgentViewHostDefinition } from './hosts/agent-view-host.definition'
import { ViewMiddlewareRuntimeService } from './view-middleware-runtime.service'

const PROVIDER = 'test_maps'
const FEATURE = 'test_maps.explore'
const agent = Object.assign(new XpertAgent(), { id: 'agent-node', key: 'agent', name: 'Maps' })
function middleware(
    key: string,
    provider = PROVIDER,
    options: IWFNMiddleware['options'] = { mode: 'demo' }
): TXpertTeamNode {
    const entity: IWFNMiddleware = { id: key, key, type: WorkflowNodeTypeEnum.MIDDLEWARE, provider, options }
    return { type: 'workflow', key, position: { x: 0, y: 0 }, entity }
}
function graph(nodes: TXpertTeamNode[]): TXpertGraph {
    return {
        nodes: [{ type: 'agent', key: agent.key, entity: agent, position: { x: 0, y: 0 } }, ...nodes],
        connections: nodes.map(({ key }) => ({ key: `agent/${key}`, type: 'workflow', from: agent.key, to: key }))
    }
}
async function fixture() {
    const xpert = Object.assign(new Xpert(), {
        id: 'assistant',
        type: XpertTypeEnum.Agent,
        name: 'Maps',
        tenantId: 'tenant',
        organizationId: 'org',
        workspaceId: 'workspace',
        agent,
        graph: graph([
            middleware('maps'),
            middleware('connector', 'ConnectorMiddleware', { provider: 'amap', connectorId: 'pinned-amap' })
        ])
    })
    const xpertService = {
        findOneByIdWithinTenant: jest.fn(async () => xpert),
        assertCanAuthorById: jest.fn(async () => undefined)
    }
    const access = { getAccessiblePublishedXpert: jest.fn(async () => xpert) }
    const registry = {
        get: jest.fn((provider: string) => ({
            meta: { name: provider, label: { en_US: provider }, features: provider === PROVIDER ? [FEATURE] : [] },
            createMiddleware: () => ({ name: provider })
        }))
    }
    const runtime: AgentMiddlewareRuntimeApi = {
        createModelClient: async () => {
            throw new Error('not used')
        },
        wrapWorkflowNodeExecution: async () => {
            throw new Error('not used')
        },
        emitMiddlewareEvent: async () => undefined,
        capabilities: new DefaultRuntimeCapabilityRegistry()
    }
    const runtimeFactory = { createScopedApi: jest.fn((_scope: AgentMiddlewareRuntimeScope) => runtime) }
    const module = await Test.createTestingModule({
        providers: [
            AgentViewHostDefinition,
            ViewMiddlewareRuntimeService,
            { provide: XpertService, useValue: xpertService },
            { provide: PublishedXpertAccessService, useValue: access },
            { provide: AgentMiddlewareRegistry, useValue: registry },
            { provide: AgentMiddlewareRuntimeService, useValue: runtimeFactory },
            { provide: getRepositoryToken(ChatConversation), useValue: { findOne: jest.fn() } },
            {
                provide: XpertProjectAccessService,
                useValue: { assertCanReadXpert: jest.fn(), assertCanUseXpert: jest.fn() }
            },
            { provide: XpertProjectXpertBindingService, useValue: { isSameXpert: jest.fn() } },
            { provide: VOLUME_CLIENT, useValue: {} },
            { provide: CommandBus, useValue: { execute: jest.fn() } },
            {
                provide: XpertProfileIdentityService,
                useValue: {
                    resolve: jest.fn(async () => ({
                        instanceId: xpert.id,
                        currentId: xpert.id,
                        versionIds: [xpert.id]
                    }))
                }
            }
        ]
    }).compile()
    const definition = module.get(AgentViewHostDefinition)
    const service = module.get(ViewMiddlewareRuntimeService)
    const context: XpertResolvedViewHostContext = {
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'user',
        workspaceId: 'workspace',
        hostType: 'agent',
        hostId: 'assistant',
        slots: definition.slots
    }
    return { xpert, xpertService, access, registry, runtimeFactory, definition, service, context }
}

describe('View middleware runtime authorization', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
    })
    afterEach(() => jest.restoreAllMocks())

    it('uses the real View host authorization and exact published connector pin without serializing config', async () => {
        const f = await fixture()
        const result = await f.service.resolve({ context: f.context, provider: PROVIDER, requiredFeature: FEATURE })
        expect(f.access.getAccessiblePublishedXpert).toHaveBeenCalledWith('assistant')
        expect(result.options).toEqual({ mode: 'demo' })
        expect(result.context).toMatchObject({
            xpertId: 'assistant',
            tenantId: 'tenant',
            userId: 'user',
            agentKey: 'agent'
        })
        expect(f.runtimeFactory.createScopedApi).toHaveBeenCalledWith(
            expect.objectContaining({
                connectorBindingIds: ['pinned-amap'],
                connectorProviders: [],
                workspaceId: 'workspace',
                viewHost: { type: 'agent', id: 'assistant' }
            })
        )
        expect(f.runtimeFactory.createScopedApi.mock.calls[0][0]).not.toHaveProperty('executionId')
        const view = await f.definition.resolve('assistant')
        expect(JSON.stringify(view)).not.toContain('pinned-amap')
        expect(JSON.stringify(view)).not.toContain('"mode"')
        expect(ViewMiddlewareRuntimeCapability.id).toBe('platform.view.middleware-runtime')
    })

    it('rechecks revoked published access on each call', async () => {
        const f = await fixture()
        await f.service.resolve({ context: f.context, provider: PROVIDER, requiredFeature: FEATURE })
        f.access.getAccessiblePublishedXpert.mockRejectedValue(new ForbiddenException())
        await expect(
            f.service.resolve({ context: f.context, provider: PROVIDER, requiredFeature: FEATURE })
        ).rejects.toThrow(ForbiddenException)
        expect(f.runtimeFactory.createScopedApi).toHaveBeenCalledTimes(1)
    })

    it.each(['tenantId', 'organizationId', 'userId'] as const)(
        'rejects a stale or substituted %s before graph resolution',
        async (field) => {
            const f = await fixture()
            f.context[field] = 'other'
            await expect(
                f.service.resolve({ context: f.context, provider: PROVIDER, requiredFeature: FEATURE })
            ).rejects.toThrow(ForbiddenException)
            expect(f.xpertService.findOneByIdWithinTenant).not.toHaveBeenCalled()
        }
    )

    it.each(['tenantId', 'organizationId', 'workspaceId'] as const)(
        'rejects a graph with a different %s',
        async (field) => {
            const f = await fixture()
            f.xpert[field] = 'other'
            await expect(
                f.service.resolve({ context: f.context, provider: PROVIDER, requiredFeature: FEATURE })
            ).rejects.toThrow(ForbiddenException)
            expect(f.runtimeFactory.createScopedApi).not.toHaveBeenCalled()
        }
    )

    it('rejects removed and ambiguous middleware connections', async () => {
        const f = await fixture()
        f.xpert.graph = graph([])
        await expect(
            f.service.resolve({ context: f.context, provider: PROVIDER, requiredFeature: FEATURE })
        ).rejects.toThrow(ForbiddenException)
        f.xpert.graph = graph([middleware('one'), middleware('two')])
        await expect(
            f.service.resolve({ context: f.context, provider: PROVIDER, requiredFeature: FEATURE })
        ).rejects.toThrow(ForbiddenException)
        expect(f.runtimeFactory.createScopedApi).not.toHaveBeenCalled()
    })

    it('requires the selected provider itself to own the Feature', async () => {
        const f = await fixture()
        f.xpert.graph = graph([middleware('maps'), middleware('other', 'unrelated')])
        await expect(
            f.service.resolve({ context: f.context, provider: 'unrelated', requiredFeature: FEATURE })
        ).rejects.toThrow(ForbiddenException)
        expect(f.runtimeFactory.createScopedApi).not.toHaveBeenCalled()
    })

    it('does not grant connectors from disconnected graph nodes', async () => {
        const f = await fixture()
        f.xpert.graph = graph([middleware('maps')])
        f.xpert.graph.nodes.push(middleware('unconnected', 'ConnectorMiddleware', { provider: 'amap' }))
        await f.service.resolve({ context: f.context, provider: PROVIDER, requiredFeature: FEATURE })
        expect(f.runtimeFactory.createScopedApi).toHaveBeenCalledWith(
            expect.objectContaining({ connectorBindingIds: [], connectorProviders: [] })
        )
    })

    it('resolves draft options and grants together only after authoring authorization', async () => {
        const f = await fixture()
        const draftGraph = graph([
            middleware('maps-draft', PROVIDER, { mode: 'live', provider: 'tencent' }),
            middleware('connector-draft', 'ConnectorMiddleware', { provider: 'tencent-map' })
        ])
        f.xpert.draft = { ...draftGraph, team: { agent } }
        const input = { context: f.context, provider: PROVIDER, requiredFeature: FEATURE, isDraft: true }
        await expect(f.service.resolve(input)).rejects.toThrow(ForbiddenException)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        const result = await f.service.resolve(input)
        expect(f.xpertService.assertCanAuthorById).toHaveBeenCalledWith('assistant', 'workspace')
        expect(result.options).toEqual({ mode: 'live', provider: 'tencent' })
        expect(f.runtimeFactory.createScopedApi).toHaveBeenCalledWith(
            expect.objectContaining({ connectorBindingIds: [], connectorProviders: ['tencent-map'] })
        )
    })
})
