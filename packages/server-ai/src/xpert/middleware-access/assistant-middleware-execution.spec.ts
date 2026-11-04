import { QueryBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import {
    UserType,
    XpertTypeEnum,
    WorkflowNodeTypeEnum,
    type IWFNMiddleware,
    type TXpertGraph
} from '@xpert-ai/contracts'
import {
    AssistantMiddlewareAccessRuntimeCapability,
    DefaultRuntimeCapabilityRegistry,
    RequestContext,
    createRuntimeCapability,
    type AssistantMiddlewareAccessApi
} from '@xpert-ai/plugin-sdk'
import { createExecutionIdentity, runWithExecutionIdentity } from '@xpert-ai/server-core'
import { ManagedQueueService } from '../../../../server/src/managed-queue/managed-queue.service'
import { AssistantPrincipalAccessService } from '../assistant-principal/assistant-principal-access.service'
import { ResolveAssistantPrincipalCommand } from '../assistant-principal/resolve-assistant-principal.command'
import { ResolveAssistantPrincipalHandler } from '../assistant-principal/resolve-assistant-principal.handler'
import { AssistantMiddlewareAccessService } from './assistant-middleware-access.service'
import { Xpert } from '../xpert.entity'

function fixture(id = 'assistant') {
    const actor = { tenantId: 'tenant', organizationId: 'org', userId: `${id}-user` }
    const node: IWFNMiddleware = {
        id: 'review',
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        key: 'review',
        provider: 'review'
    }
    const graph: TXpertGraph = {
        nodes: [{ type: 'workflow', key: 'review', position: { x: 0, y: 0 }, entity: node }],
        connections: [{ type: 'workflow', key: 'agent/review', from: 'agent', to: 'review' }]
    }
    const assistant = Object.assign(new Xpert(), {
        id,
        ...actor,
        type: XpertTypeEnum.Agent,
        latest: true,
        active: true,
        graph,
        agent: { key: 'agent' }
    })
    const user = { id: actor.userId, tenantId: actor.tenantId, type: UserType.COMMUNICATION, isActive: true }
    const principals = {
        isPrincipal: jest.fn().mockResolvedValue(true),
        find: jest.fn().mockResolvedValue({ user, assistant, assistants: [assistant] })
    }
    const queries = { execute: jest.fn().mockResolvedValue(assistant) }
    const resolver = new ResolveAssistantPrincipalHandler(
        { getRepository: () => ({ findOneBy: async () => assistant }) } as unknown as DataSource,
        principals as unknown as AssistantPrincipalAccessService,
        queries as unknown as QueryBus
    )
    const commands = { execute: jest.fn((command: ResolveAssistantPrincipalCommand) => resolver.execute(command)) }
    const middleware = { get: jest.fn().mockReturnValue({ meta: { features: ['review'] } }) }
    const service = new AssistantMiddlewareAccessService(
        { getAccessiblePublishedXpertForActor: jest.fn() },
        middleware,
        { assertAssistant: jest.fn() },
        { createQueryBuilder: jest.fn() },
        principals,
        commands as never
    )
    const registry = new DefaultRuntimeCapabilityRegistry().register(
        AssistantMiddlewareAccessRuntimeCapability,
        service
    )
    // Independently constructed SDK key must resolve by its stable ID, not object/class identity.
    const api = registry.require(
        createRuntimeCapability<AssistantMiddlewareAccessApi>(AssistantMiddlewareAccessRuntimeCapability.id)
    )
    const input = {
        actor,
        assistantId: id,
        provider: 'review',
        requiredFeature: 'review',
        scope: { type: 'assistant' as const }
    }
    const storage = { add: jest.fn(async (_name: string, _payload: unknown, _options: unknown) => ({ id: 'job' })) }
    const queue = new ManagedQueueService(
        storage as never,
        storage as never,
        storage as never,
        storage as never,
        {} as never,
        storage as never,
        storage as never,
        {} as never
    )
    return { actor, user, assistant, principals, middleware, queries, api, input, queue, storage }
}

const human = createExecutionIdentity(
    { id: 'human', tenantId: 'tenant', type: UserType.USER },
    { tenantId: 'tenant', organizationId: 'org', userId: 'human', kind: 'user' }
)

it('authorizes in server-ai then enqueues a generic service actor, preserving the initiating human', async () => {
    const f = fixture()
    await runWithExecutionIdentity(human, async () => {
        await f.api.runAsAssistant(f.input, () =>
            f.queue.enqueue({
                pluginName: 'review',
                queueName: 'review',
                jobName: 'run',
                tenantId: 'tenant',
                organizationId: 'org',
                userId: f.actor.userId,
                payload: { policyId: 'policy' }
            })
        )
        expect(RequestContext.currentUserId()).toBe('human')
    })
    expect(f.queries.execute).toHaveBeenCalled()
    expect(f.storage.add.mock.calls[0][1]).toMatchObject({
        userId: f.actor.userId,
        actor: { userId: f.actor.userId, tenantId: 'tenant', organizationId: 'org', type: 'service' }
    })
    expect(f.storage.add.mock.calls[0][1]).not.toHaveProperty('runtimePrincipal')
    expect(f.storage.add.mock.calls[0][1]).not.toHaveProperty('delegation')
})

it('rechecks Assistant and exact middleware availability before every invocation', async () => {
    const f = fixture(),
        work = jest.fn(async () => undefined)
    await f.api.runAsAssistant(f.input, work)
    f.principals.find.mockResolvedValue(null)
    await expect(f.api.runAsAssistant(f.input, work)).rejects.toThrow()
    expect(work).toHaveBeenCalledTimes(1)
    const removed = fixture()
    removed.assistant.graph.connections = []
    await expect(removed.api.runAsAssistant(removed.input, work)).rejects.toThrow()
    expect(work).toHaveBeenCalledTimes(1)
})

it('rejects an unrelated current actor, cross-tenant scope and human access revocation before work', async () => {
    const f = fixture(),
        work = jest.fn(async () => undefined)
    const other = createExecutionIdentity(
        { id: 'other', tenantId: 'tenant', type: UserType.COMMUNICATION },
        { tenantId: 'tenant', organizationId: 'org', userId: 'other', kind: 'service' }
    )
    await expect(runWithExecutionIdentity(other, () => f.api.runAsAssistant(f.input, work))).rejects.toThrow()
    await expect(
        runWithExecutionIdentity(human, () =>
            f.api.runAsAssistant({ ...f.input, actor: { ...f.actor, tenantId: 'other-tenant' } }, work)
        )
    ).rejects.toThrow()
    f.queries.execute.mockRejectedValue(new Error('access revoked'))
    await expect(runWithExecutionIdentity(human, () => f.api.runAsAssistant(f.input, work))).rejects.toThrow(
        'access revoked'
    )
    expect(work).not.toHaveBeenCalled()
})

it('isolates concurrent Assistant contexts and restores the caller after callback failure', async () => {
    const a = fixture('a'),
        b = fixture('b')
    await runWithExecutionIdentity(human, async () => {
        await Promise.all(
            [a, b].map((f) =>
                f.api.runAsAssistant(f.input, async () => {
                    await new Promise<void>((resolve) => setImmediate(resolve))
                    expect(RequestContext.currentUserId()).toBe(f.actor.userId)
                    expect(RequestContext.getOrganizationId()).toBe('org')
                })
            )
        )
        await expect(
            a.api.runAsAssistant(a.input, async () => {
                throw new Error('enqueue failed')
            })
        ).rejects.toThrow('enqueue failed')
        expect(RequestContext.currentUserId()).toBe('human')
    })
})
