import { CommandBus } from '@nestjs/cqrs'
import { WorkflowNodeTypeEnum, XpertTypeEnum, type TXpertGraph } from '@xpert-ai/contracts'
import { WorkflowTriggerRegistry } from '@xpert-ai/plugin-sdk'
import { IntegrationQrService } from '@xpert-ai/server-core'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { Xpert } from './xpert.entity'
import { XpertTriggerConnectionService } from './trigger-connection.service'
import { XpertPublishTriggersCommand } from './commands/publish-triggers.command'
import { patchConnectionGraph, triggerConfig } from './trigger-connection.graph'

jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: { currentUserId: () => 'user', currentTenantId: () => 'tenant', getOrganizationId: () => 'org' },
    IntegrationQrService: class {}
}))
jest.mock('@xpert-ai/plugin-sdk', () => ({ WorkflowTriggerRegistry: class {} }))
jest.mock('./xpert.entity', () => ({ Xpert: class {} }))
jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

describe('Xpert trigger quick connections', () => {
    function setup() {
        const graph: TXpertGraph = {
            nodes: [
                {
                    key: 'primary',
                    type: 'agent',
                    position: { x: 280, y: 0 },
                    entity: { key: 'primary', name: 'Assistant' }
                }
            ],
            connections: []
        }
        let persisted: Xpert = Object.assign(new Xpert(), {
            id: 'xpert',
            name: 'Assistant',
            type: XpertTypeEnum.Agent,
            tenantId: 'tenant',
            organizationId: 'org',
            publishAt: new Date(),
            agent: { key: 'primary' },
            graph,
            draft: {
                ...structuredClone(graph),
                team: { title: 'Unpublished title', agentConfig: { systemPrompt: 'Unpublished prompt' } }
            }
        })
        let online = false
        const write = { graph: '', draft: null as string | null }
        const query = {
            update: () => query,
            set: () => query,
            where: () => query,
            setParameters: (params: typeof write) => {
                Object.assign(write, params)
                return query
            },
            execute: jest.fn(async () => {
                persisted = Object.assign(new Xpert(), persisted, {
                    graph: JSON.parse(write.graph),
                    draft: write.draft ? JSON.parse(write.draft) : null
                })
            })
        }
        const repository = {
            findOne: jest.fn(async () => persisted),
            createQueryBuilder: () => query,
            update: query.execute
        }
        const manager = { getRepository: () => repository }
        const database = {
            transaction: jest.fn(async <T>(work: (manager: EntityManager) => Promise<T>) => {
                const before = persisted
                try {
                    return await work(manager as unknown as EntityManager)
                } catch (error) {
                    persisted = before
                    throw error
                }
            })
        }
        const strategy = {
            meta: {
                name: 'dingtalk',
                quickConnect: { method: 'qr', integrationProvider: 'dingtalk_long', configField: 'integrationId' }
            },
            validate: jest.fn(async () => []),
            connectionStatus: jest.fn(async () => ({ connected: online, state: online ? 'connected' : 'failed' }))
        }
        const registry = { get: jest.fn(() => strategy), list: jest.fn(() => [strategy]) }
        const qr = {
            begin: jest.fn(),
            assertContext: jest.fn(),
            complete: jest.fn(async () => ({ id: 'integration', provider: 'dingtalk_long' }))
        }
        const commands = {
            execute: jest.fn(async (command: XpertPublishTriggersCommand) => {
                online = triggerConfig(command.xpert.graph, 'dingtalk')?.enabled === true
            })
        }
        const service = new XpertTriggerConnectionService(
            repository as unknown as Repository<Xpert>,
            database as unknown as DataSource,
            registry as unknown as WorkflowTriggerRegistry,
            qr as unknown as IntegrationQrService,
            commands as unknown as CommandBus
        )
        return { service, repository, database, strategy, qr, commands, current: () => persisted }
    }

    it('activates only the selected trigger and preserves unpublished agent edits', async () => {
        const f = setup()
        const pending = structuredClone(f.current().draft.team)
        expect(await f.service.complete('xpert', 'dingtalk', 'session')).toMatchObject({
            enabled: true,
            connected: true
        })
        expect(f.qr.assertContext).toHaveBeenCalledWith('session', 'xpert', 'dingtalk')
        expect(f.current().draft.team).toEqual(pending)
        expect(f.current().graph.nodes[0].entity).not.toHaveProperty('systemPrompt')
        expect(triggerConfig(f.current().graph, 'dingtalk')).toEqual({ enabled: true, integrationId: 'integration' })
        expect(triggerConfig(f.current().draft, 'dingtalk')).toEqual(triggerConfig(f.current().graph, 'dingtalk'))
        expect(f.commands.execute.mock.calls[0][0].options).toMatchObject({ providers: ['dingtalk'], strict: true })
        expect(f.repository.findOne).toHaveBeenCalledWith({
            where: { id: 'xpert', tenantId: 'tenant', organizationId: 'org' },
            loadEagerRelations: false,
            lock: { mode: 'pessimistic_write' }
        })
    })

    it('disconnects immediately and persists disabled state in both runtime and draft', async () => {
        const f = setup()
        await f.service.complete('xpert', 'dingtalk', 'session')
        expect(await f.service.disconnect('xpert', 'dingtalk')).toMatchObject({ enabled: false, connected: false })
        expect(triggerConfig(f.current().graph, 'dingtalk').enabled).toBe(false)
        expect(triggerConfig(f.current().draft, 'dingtalk').enabled).toBe(false)
        expect(f.qr.complete).toHaveBeenCalledTimes(1)
    })

    it('rolls back persisted configuration and stops the new binding when startup fails', async () => {
        const f = setup()
        const before = structuredClone(f.current())
        f.commands.execute.mockRejectedValueOnce(new Error('socket failed'))
        await expect(f.service.complete('xpert', 'dingtalk', 'session')).rejects.toThrow('socket failed')
        expect(f.current()).toEqual(before)
        expect(f.commands.execute).toHaveBeenCalledTimes(2)
        expect(f.commands.execute.mock.calls[1][0].xpert.graph).toEqual(before.graph)
    })

    it('does not report success if the stream status remains offline', async () => {
        const f = setup()
        f.strategy.connectionStatus.mockResolvedValue({ connected: false, state: 'failed' })
        await expect(f.service.complete('xpert', 'dingtalk', 'session')).rejects.toThrow('could not start')
        expect(triggerConfig(f.current().graph, 'dingtalk')).toBeUndefined()
    })

    it('rejects unpublished edits of the same trigger before creating an integration', async () => {
        const f = setup()
        const xpert = f.current()
        xpert.draft = {
            ...xpert.draft,
            ...patchConnectionGraph(xpert.draft, 'dingtalk', 'trigger', 'primary', {
                enabled: true,
                integrationId: 'other'
            })
        }
        await expect(f.service.complete('xpert', 'dingtalk', 'session')).rejects.toThrow('unpublished changes')
        expect(f.qr.complete).not.toHaveBeenCalled()
        expect(f.repository.update).not.toHaveBeenCalled()
    })

    it('requires a published assistant and rejects a QR session from a different context', async () => {
        const f = setup()
        f.current().publishAt = null
        await expect(f.service.begin('xpert', 'dingtalk')).rejects.toThrow('Publish a runnable')
        f.qr.assertContext.mockRejectedValue(new Error('wrong context'))
        await expect(f.service.complete('xpert', 'dingtalk', 'session')).rejects.toThrow('wrong context')
        expect(f.qr.begin).not.toHaveBeenCalled()
    })

    it('does not duplicate nodes or edges when completion is retried', async () => {
        const f = setup()
        await f.service.complete('xpert', 'dingtalk', 'session')
        await f.service.complete('xpert', 'dingtalk', 'session')
        expect(
            f
                .current()
                .graph.nodes.filter(
                    (node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.TRIGGER
                )
        ).toHaveLength(1)
        expect(f.current().graph.connections).toHaveLength(1)
    })

    it('applies a legacy draft-only disconnect to the running connection', async () => {
        const f = setup()
        await f.service.complete('xpert', 'dingtalk', 'session')
        triggerConfig(f.current().draft, 'dingtalk').enabled = false
        expect(await f.service.disconnect('xpert', 'dingtalk')).toMatchObject({ enabled: false, connected: false })
        expect(triggerConfig(f.current().graph, 'dingtalk').enabled).toBe(false)
    })
})
