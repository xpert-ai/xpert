import { RuntimeDeploymentsService } from './runtime-deployments.service'
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
    AgentInvocationScope,
    AgentRuntimeRegistry,
    BUILTIN_GLOBAL_SCOPE,
    IAgentRuntimeStrategy
} from '@xpert-ai/plugin-sdk'
import { AgentRuntimeBindingEntity } from '../invocation.entity'
import { XpertWorkspace } from '../../xpert-workspace/workspace.entity'
import { ManagedRuntimeService } from './managed-runtime.service'

const url = process.env.XPERT_MANAGED_RUNTIME_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('managed runtime binding transactions on PostgreSQL', () => {
    let db: DataSource
    let service: ManagedRuntimeService
    const schema = `managed_${randomUUID().replace(/-/g, '')}`
    const scope: AgentInvocationScope = {
        tenantId: randomUUID(),
        organizationId: randomUUID(),
        userId: randomUUID(),
        workspaceId: randomUUID(),
        conversationId: randomUUID(),
        callerXpertId: randomUUID(),
        parentExecutionId: randomUUID(),
        callerAgentKey: 'agent'
    }
    const selection = { provider: 'test', reference: 'managed-test' }
    beforeAll(async () => {
        if (!new URL(url).pathname.endsWith('_test')) throw Error('Disposable test database required')
        db = await new DataSource({
            type: 'postgres',
            url,
            schema,
            extra: { options: `-c search_path=${schema}` },
            entities: [
                new EntitySchema<AgentRuntimeBindingEntity>({
                    name: 'AgentRuntimeBindingEntity',
                    target: AgentRuntimeBindingEntity,
                    tableName: 'agent_runtime_binding',
                    columns: {
                        id: { type: 'uuid', primary: true },
                        tenantId: { type: 'uuid' },
                        organizationId: { type: 'uuid' },
                        title: { type: 'varchar' },
                        enabled: { type: 'boolean' },
                        workspaceIds: { type: 'jsonb' },
                        target: { type: 'jsonb' }
                    }
                }),
                new EntitySchema<XpertWorkspace>({
                    name: 'XpertWorkspace',
                    target: XpertWorkspace,
                    tableName: 'xpert_workspace',
                    columns: {
                        id: { type: 'uuid', primary: true },
                        tenantId: { type: 'uuid' },
                        organizationId: { type: 'uuid' },
                        status: { type: 'varchar' }
                    }
                })
            ]
        }).initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
        await db.getRepository(XpertWorkspace).insert({
            id: scope.workspaceId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            status: 'active'
        })
        const registry = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
        const strategy: IAgentRuntimeStrategy = {
            managedProfiles: [
                {
                    reference: selection.reference,
                    version: '1',
                    title: 'Test',
                    toolName: 'delegate_test',
                    description: 'Test',
                    environment: 'computer'
                }
            ],
            capabilities: {
                background: true,
                recovery: 'session',
                cancellation: true,
                interactions: false,
                executionTools: [{ id: 'test', versions: ['1.0.0'], environments: ['computer'] }]
            },
            start: jest.fn(),
            inspect: jest.fn()
        }
        registry.register('test', strategy, { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE })
        service = new ManagedRuntimeService(
            db.getRepository(AgentRuntimeBindingEntity),
            registry,
            {
                execute: async () => ({ tools: [{ id: 'test', version: '1.0.0' }], modelSourceId: scope.callerXpertId })
            } as unknown as CommandBus,
            {
                execute: async () => ({
                    agent: {
                        team: {
                            tenantId: scope.tenantId,
                            organizationId: scope.organizationId,
                            workspaceId: scope.workspaceId
                        }
                    }
                })
            } as unknown as QueryBus,
            new RuntimeDeploymentsService()
        )
    })
    afterAll(async () => {
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    it('creates one immutable binding for simultaneous first use, and never resurrects it after disablement', async () => {
        const targets = await Promise.all(Array.from({ length: 12 }, () => service.resolve(scope, selection)))
        expect(new Set(targets.map((target) => target.bindingId)).size).toBe(1)
        const repository = db.getRepository(AgentRuntimeBindingEntity)
        expect(await repository.count()).toBe(1)
        expect(targets[0].configuration.managedRuntime).toEqual({ type: 'builtin', version: '1' })
        await repository.update(targets[0].bindingId, { enabled: false })
        const attempts = await Promise.allSettled(Array.from({ length: 6 }, () => service.resolve(scope, selection)))
        expect(attempts.every((item) => item.status === 'rejected')).toBe(true)
        expect(await repository.count()).toBe(1)
        expect((await repository.findOneByOrFail({ id: targets[0].bindingId })).enabled).toBe(false)
    })
})
