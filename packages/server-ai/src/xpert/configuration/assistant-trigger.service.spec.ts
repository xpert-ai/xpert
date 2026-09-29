import { ForbiddenException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { WorkflowTriggerRegistry } from '@xpert-ai/plugin-sdk'
import {
    WorkflowNodeTypeEnum,
    type AssistantTriggerMutation,
    type IWFNTrigger,
    type TXpertGraph
} from '@xpert-ai/contracts'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { Xpert } from '../xpert.entity'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { AssistantTriggerService } from './assistant-trigger.service'
import { parseTriggerMutation } from './assistant-trigger.validation'
import { connectionTrigger } from '../trigger-connection.graph'
import { XpertPublishTriggersCommand } from '../commands/publish-triggers.command'

jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: { currentTenantId: () => 'tenant', getOrganizationId: () => 'org', currentUserId: () => 'user' },
    WorkflowTriggerRegistry: class {}
}))
jest.mock('../xpert.entity', () => ({ Xpert: class {} }))
jest.mock('../../chat-conversation/conversation.entity', () => ({ ChatConversation: class {} }))
jest.mock('../../xpert-workspace/workspace-access.service', () => ({ XpertWorkspaceAccessService: class {} }))
jest.mock('i18next', () => ({ t: (key: string) => key }))

function fixture() {
    const graph: TXpertGraph = {
        nodes: [
            {
                key: 'main',
                type: 'agent',
                position: { x: 0, y: 0 },
                entity: { key: 'main', name: 'Assistant', prompt: 'Published role' }
            }
        ],
        connections: []
    }
    let stored = Object.assign(new Xpert(), {
        id: 'assistant',
        workspaceId: 'workspace',
        tenantId: 'tenant',
        organizationId: 'org',
        agent: { key: 'main' },
        publishAt: new Date(),
        graph,
        draft: { ...structuredClone(graph), team: { name: 'Unpublished name' } }
    })
    let parameters: { graph: string; draft: string | null }
    const query = {
        update: () => query,
        set: () => query,
        where: jest.fn(() => query),
        setParameters: (input: typeof parameters) => {
            parameters = input
            return query
        },
        execute: jest.fn(async () => {
            stored = Object.assign(new Xpert(), stored, {
                graph: JSON.parse(parameters.graph),
                draft: parameters.draft ? JSON.parse(parameters.draft) : null
            })
        })
    }
    const repository = { findOne: jest.fn(async () => stored), createQueryBuilder: () => query }
    const database = {
        transaction: async <T>(work: (manager: EntityManager) => Promise<T>) => {
            const previous = stored
            try {
                return await work({ getRepository: () => repository } as unknown as EntityManager)
            } catch (error) {
                stored = previous
                throw error
            }
        }
    }
    const access = { assertCanRead: jest.fn(), assertCanAuthor: jest.fn() }
    const strategy = {
        meta: {
            name: 'schedule',
            label: { en_US: 'Schedule' },
            configSchema: {
                type: 'object',
                additionalProperties: false,
                properties: { enabled: { type: 'boolean' }, cron: { type: 'string' }, task: { type: 'string' } },
                required: ['enabled', 'cron', 'task']
            }
        },
        validate: jest.fn(async () => []),
        publish: jest.fn(),
        stop: jest.fn()
    }
    const registry = { list: () => [strategy], get: () => strategy }
    const activity = {
        select: () => activity,
        addSelect: () => activity,
        where: () => activity,
        andWhere: () => activity,
        getRawOne: async () => ({ activityAt: '2026-09-29T08:30:00Z', runAt: '2026-09-29T08:00:00Z' })
    }
    const conversations = { createQueryBuilder: () => activity }
    const commands = { execute: jest.fn(async (_command: XpertPublishTriggersCommand) => {}) }
    const service = new AssistantTriggerService(
        repository as unknown as Repository<Xpert>,
        conversations as unknown as Repository<ChatConversation>,
        database as unknown as DataSource,
        registry as unknown as WorkflowTriggerRegistry,
        access as unknown as XpertWorkspaceAccessService,
        commands as unknown as CommandBus
    )
    const input = async (): Promise<AssistantTriggerMutation> => ({
        revision: (await service.list('assistant')).revision,
        provider: 'schedule',
        operation: 'save',
        title: 'Morning brief',
        config: {
            enabled: true,
            cron: '0 8 * * *',
            task: 'Summarize projects',
            additionalInstructions: 'Focus on blockers'
        }
    })
    return { service, input, access, commands, repository, query, strategy, current: () => stored }
}

describe('Assistant trigger settings', () => {
    it('updates only the trigger and mirrors that change into the draft', async () => {
        const f = fixture()
        const pending = structuredClone(f.current().draft.team)
        await f.service.mutate('assistant', await f.input())
        expect(f.current().draft.team).toEqual(pending)
        expect(f.current().graph.nodes[0].entity).toMatchObject({ prompt: 'Published role' })
        expect(connectionTrigger(f.current().graph, 'schedule')?.entity).toMatchObject({
            title: 'Morning brief',
            config: { additionalInstructions: 'Focus on blockers' }
        })
        expect(connectionTrigger(f.current().graph, 'schedule')?.entity).not.toHaveProperty('additionalInstructions')
        expect(f.strategy.validate).toHaveBeenCalledWith({
            xpertId: 'assistant',
            config: { enabled: true, cron: '0 8 * * *', task: 'Summarize projects' }
        })
        expect(f.commands.execute.mock.calls[0][0].options).toMatchObject({ providers: ['schedule'], strict: true })
        expect(f.query.where).toHaveBeenCalledWith({ id: 'assistant', tenantId: 'tenant', organizationId: 'org' })
        expect(f.access.assertCanAuthor).toHaveBeenCalledWith('workspace')
    })
    it('supports pause, resume and delete without removing the primary agent', async () => {
        const f = fixture()
        await f.service.mutate('assistant', await f.input())
        for (const enabled of [false, true]) {
            await f.service.mutate('assistant', { ...(await f.input()), operation: 'toggle', enabled })
            expect((connectionTrigger(f.current().graph, 'schedule')?.entity as IWFNTrigger).config.enabled).toBe(
                enabled
            )
        }
        await f.service.mutate('assistant', { ...(await f.input()), operation: 'delete' })
        expect(f.current().graph.nodes).toHaveLength(1)
        expect(f.current().graph.connections).toHaveLength(0)
        expect(f.current().draft.nodes).toHaveLength(1)
    })
    it('rejects stale edits and conflicting Studio drafts', async () => {
        const f = fixture()
        const stale = await f.input()
        await f.service.mutate('assistant', stale)
        await expect(f.service.mutate('assistant', stale)).rejects.toMatchObject({ status: 409 })
        const pending = connectionTrigger(f.current().draft, 'schedule')!.entity as IWFNTrigger
        pending.config.cron = '0 9 * * *'
        await expect(f.service.mutate('assistant', await f.input())).rejects.toMatchObject({ status: 409 })
    })
    it('rolls persistence back and restores the previous runtime after an activation failure', async () => {
        const f = fixture()
        const previous = f.current()
        f.commands.execute.mockRejectedValueOnce(new Error('offline'))
        await expect(f.service.mutate('assistant', await f.input())).rejects.toThrow('offline')
        expect(f.current()).toBe(previous)
        expect(f.commands.execute).toHaveBeenCalledTimes(2)
    })
    it('exposes read-only state and independently denies writes', async () => {
        const f = fixture()
        f.access.assertCanAuthor.mockRejectedValue(new ForbiddenException())
        expect((await f.service.list('assistant')).canEdit).toBe(false)
        await expect(f.service.mutate('assistant', await f.input())).rejects.toMatchObject({ status: 403 })
        expect(f.query.execute).not.toHaveBeenCalled()
    })
    it('validates schema types before the provider and rejects malformed requests', async () => {
        const f = fixture()
        const input = await f.input()
        if (input.operation !== 'save') throw new Error('fixture')
        await expect(
            f.service.validate('assistant', { ...input, config: { ...input.config, enabled: 'yes' } })
        ).rejects.toMatchObject({ status: 400 })
        expect(f.strategy.validate).not.toHaveBeenCalled()
        for (const value of [
            null,
            {},
            { ...input, provider: 'chat' },
            { ...input, config: { ...input.config, additionalInstructions: 'x'.repeat(8001) } },
            { ...input, config: { ...input.config, additionalInstructions: { nested: 'invalid' } } },
            { ...input, config: JSON.parse('{"__proto__":{}}') }
        ])
            expect(() => parseTriggerMutation(value)).toThrow()
    })
    it('does not expose credentials, nested config or unknown fields in list responses', async () => {
        const f = fixture()
        await f.service.mutate('assistant', await f.input())
        Object.assign(f.strategy.meta.configSchema.properties, {
            secret: { type: 'string', 'x-ui': { component: 'password' } },
            nested: { type: 'object', properties: { token: { type: 'string' } } }
        })
        const trigger = connectionTrigger(f.current().graph, 'schedule')!.entity as IWFNTrigger
        Object.assign(trigger.config, { secret: 'private', nested: { token: 'private' }, unknown: 'private' })
        const result = await f.service.list('assistant')
        expect(result.items[0].config).toEqual({
            enabled: true,
            cron: '0 8 * * *',
            task: 'Summarize projects',
            additionalInstructions: 'Focus on blockers'
        })
    })
    it('returns provider metadata and timestamps without imposing the Bosi catalog or category', async () => {
        const f = fixture()
        await f.service.mutate('assistant', await f.input())
        const data = await f.service.list('assistant')
        expect(data.providers[0].presentation).toBeUndefined()
        expect(data.items[0]).not.toHaveProperty('category')
        expect(data.items[0]).toMatchObject({
            lastActivityAt: '2026-09-29T08:30:00.000Z',
            lastRunAt: '2026-09-29T08:00:00.000Z'
        })
        const presentation = { category: 'channel', channel: 'custom-channel', accountFields: ['account'] }
        Object.assign(f.strategy.meta, { assistant: presentation })
        expect((await f.service.list('assistant')).providers[0].presentation).toEqual(presentation)
    })
})
