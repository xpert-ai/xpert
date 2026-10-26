import { ResolveManagedRuntimeActorCommand } from './resolve-managed-runtime-actor.command'
import { CommandHandlerNotFoundException } from '@nestjs/cqrs'
import { RuntimeDeploymentsService } from './runtime-deployments.service'
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { CommandBus, CqrsModule, QueryBus } from '@nestjs/cqrs'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { Repository } from 'typeorm'
import {
    AgentInvocationScope,
    AgentRuntimeRegistry,
    BUILTIN_GLOBAL_SCOPE,
    IAgentRuntimeStrategy,
    ManagedAgentRuntimeProfile
} from '@xpert-ai/plugin-sdk'
import { AgentRuntimeBindingEntity } from '../invocation.entity'
import { ManagedRuntimeService, managedBindingId } from './managed-runtime.service'

function fixture(commandBus?: CommandBus) {
    const deployments = new RuntimeDeploymentsService()
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
    const profile: ManagedAgentRuntimeProfile = {
        reference: 'managed-test',
        version: '1',
        title: 'Test',
        toolName: 'delegate_test',
        description: 'Test runtime',
        environment: 'computer'
    }
    const provider: IAgentRuntimeStrategy = {
        managedProfiles: [profile],
        capabilities: {
            background: true,
            recovery: 'session',
            interactions: false,
            cancellation: true,
            executionTools: [{ id: 'test', versions: ['1.0.0'], environments: ['computer'] }]
        },
        start: jest.fn(),
        inspect: jest.fn()
    }
    const registry = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
    registry.register('test', provider, { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE })
    const rows: AgentRuntimeBindingEntity[] = []
    const workspace = { findOneBy: jest.fn(async () => ({ status: 'active' })) }
    const insert = {
        values: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn(async () => {
            const values = insert.values.mock.calls.at(-1)[0]
            const params = insert.setParameters.mock.calls.at(-1)[0]
            rows.push(
                Object.assign(new AgentRuntimeBindingEntity(), values, {
                    workspaceIds: JSON.parse(params.workspaces),
                    target: JSON.parse(params.target)
                })
            )
        })
    }
    const repository = {
        find: jest.fn(async () => rows),
        findOneBy: jest.fn(async ({ id }) => rows.find((row) => row.id === id && row.enabled)),
        findOneByOrFail: jest.fn(async ({ id }: { id: string }) => rows.find((row) => row.id === id)),
        createQueryBuilder: () => ({ insert: () => insert }),
        manager: {
            getRepository: () => workspace,
            transaction: jest.fn(async (work) => work({ query: jest.fn(), getRepository: () => repository }))
        }
    }
    const commands = {
        execute: jest.fn(async () => ({
            tools: [{ id: 'test', version: '1.0.0' }],
            modelSourceId: scope.callerXpertId
        }))
    }
    const queries = {
        execute: jest.fn(async () => ({
            agent: {
                team: { tenantId: scope.tenantId, organizationId: scope.organizationId, workspaceId: scope.workspaceId }
            }
        }))
    }
    const service = new ManagedRuntimeService(
        repository as unknown as Repository<AgentRuntimeBindingEntity>,
        registry,
        commandBus ?? (commands as unknown as CommandBus),
        queries as unknown as QueryBus,
        deployments
    )
    const selection = { provider: 'test', reference: profile.reference }
    return {
        service,
        scope,
        profile,
        provider,
        rows,
        repository,
        commands,
        queries,
        workspace,
        insert,
        selection,
        registry,
        deployments
    }
}

describe('inherited managed Agent runtime admission', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })
    it('discovers SDK backends without Computer, creates bindings automatically and never persists deployment secrets', async () => {
        const f = fixture()
        const profile = { ...f.profile, reference: 'managed-claude-code', environment: 'sdk' as const }
        const strategy: IAgentRuntimeStrategy = {
            ...f.provider,
            managedProfiles: [profile],
            resolveManagedDeployment: jest.fn(async () => ({
                type: 'sdk' as const,
                environment: { ANTHROPIC_API_KEY: 'secret-token' },
                timeoutMs: 600000
            }))
        }
        const source = {
            kind: 'plugin' as const,
            scopeKey: f.scope.organizationId,
            pluginName: '@test/runtime',
            pluginVersion: '1'
        }
        f.registry.register('claude-code', strategy, source)
        // A real bus throws missing-handler errors synchronously. Preserve that dispatch contract in the fixture.
        f.commands.execute.mockImplementation((command?: unknown) => {
            if (command instanceof ResolveManagedRuntimeActorCommand)
                return Promise.resolve({ modelSourceId: f.scope.callerXpertId, tools: [] })
            throw new CommandHandlerNotFoundException('ResolveManagedRuntimeToolsCommand')
        })
        const selection = { provider: 'claude-code', reference: profile.reference }
        expect(await f.service.list(f.scope)).toEqual([expect.objectContaining(selection)])
        expect(f.insert.execute).not.toHaveBeenCalled()
        const target = await f.service.resolve(f.scope, selection)
        expect(target.configuration.executionEnvironment).toEqual({ type: 'sdk' })
        expect(JSON.stringify(f.rows)).not.toMatch(/secret-token|ANTHROPIC_API_KEY|workspaceRoot/)
        const prepare = jest.spyOn(f.deployments, 'prepare').mockImplementation(async (deployment) => deployment)
        expect(await f.service.deployment(f.scope, target)).toMatchObject({
            environment: { ANTHROPIC_API_KEY: 'secret-token' }
        })
        expect(prepare).toHaveBeenCalledWith(expect.anything(), f.scope)
        f.commands.execute.mockRejectedValueOnce(new Error('Assistant access revoked'))
        await expect(f.service.deployment(f.scope, target)).rejects.toThrow('Assistant access revoked')
        expect(prepare).toHaveBeenCalledTimes(1)
        f.registry.unregister('claude-code', source, strategy)
        await expect(f.service.deployment(f.scope, target)).rejects.toMatchObject({ code: 'ProviderUnavailable' })
    })

    it('discovers a third-party provider from installed strategies, isolates organizations and invalidates changed settings', async () => {
        const f = fixture()
        const spec = {
            type: 'service' as const,
            serverUrl: 'https://runtime.example/',
            authorization: 'private',
            timeoutMs: 600000
        }
        const profile = { ...f.profile, reference: 'remote', environment: 'service' as const }
        const resolveManagedDeployment = jest.fn(
            async (_reference: string, _scope: Readonly<AgentInvocationScope>) => spec
        )
        const strategy = { ...f.provider, managedProfiles: [profile], resolveManagedDeployment }
        const source = {
            kind: 'plugin' as const,
            scopeKey: f.scope.organizationId,
            pluginName: '@acme/custom-agent',
            pluginVersion: '1'
        }
        f.registry.register('custom-agent', strategy, source)
        const choice = { provider: 'custom-agent', reference: 'remote' }
        expect(await f.service.list(f.scope)).toContainEqual(expect.objectContaining(choice))
        expect(resolveManagedDeployment).toHaveBeenCalledWith('remote', f.scope)
        expect(Object.isFrozen(resolveManagedDeployment.mock.calls[0][1])).toBe(true)
        const target = await f.service.resolve(f.scope, choice)
        expect(JSON.stringify(target)).not.toMatch(/runtime.example|private/)
        spec.serverUrl = 'https://changed.example/'
        const next = await f.service.resolve(f.scope, choice)
        expect(next.bindingId).not.toBe(target.bindingId)
        await expect(f.service.deployment(f.scope, target)).rejects.toMatchObject({ code: 'ProviderUnavailable' })
        f.registry.unregister('custom-agent', source, strategy)
        f.registry.register('custom-agent', strategy, { ...source, scopeKey: randomUUID() })
        expect(await f.service.list(f.scope)).not.toContainEqual(expect.objectContaining(choice))
        await expect(f.service.assertEnabled(f.scope, f.rows[1])).rejects.toMatchObject({ code: 'ProviderUnavailable' })
    })

    it('does not read plugin launch settings before actor authorization, or create grants for unavailable strategies', async () => {
        const f = fixture()
        const resolveManagedDeployment = jest.fn(async () => undefined)
        f.registry.register(
            'optional-agent',
            {
                ...f.provider,
                managedProfiles: [{ ...f.profile, reference: 'optional', environment: 'sdk' }],
                resolveManagedDeployment
            },
            { kind: 'plugin', scopeKey: f.scope.organizationId, pluginName: '@test/optional' }
        )
        f.commands.execute.mockRejectedValueOnce(new Error('Actor denied'))
        await expect(f.service.list(f.scope)).rejects.toThrow('Actor denied')
        expect(resolveManagedDeployment).not.toHaveBeenCalled()
        expect(await f.service.list(f.scope)).not.toContainEqual(
            expect.objectContaining({ provider: 'optional-agent' })
        )
        expect(f.insert.execute).not.toHaveBeenCalled()
    })

    it('supports an open-source host without a Computer handler and never creates a binding', async () => {
        const module = await Test.createTestingModule({ imports: [CqrsModule.forRoot()] }).compile()
        await module.init()
        try {
            const f = fixture(module.get(CommandBus))
            expect(await f.service.list(f.scope)).toEqual([])
            await expect(f.service.resolve(f.scope, f.selection)).rejects.toMatchObject({ code: 'ProviderUnavailable' })
            expect(f.repository.manager.transaction).not.toHaveBeenCalled()
            expect(f.insert.execute).not.toHaveBeenCalled()
        } finally {
            await module.close()
        }
    })
    it('discovers without writes; creates and reuses an immutable workspace binding on first use', async () => {
        const f = fixture()
        expect(await f.service.list(f.scope)).toEqual([
            { ...f.selection, title: 'Test', toolName: 'delegate_test', description: 'Test runtime' }
        ])
        expect(f.insert.execute).not.toHaveBeenCalled()
        const first = await f.service.resolve(f.scope, f.selection)
        expect(await f.service.resolve({ ...f.scope, userId: randomUUID() }, f.selection)).toEqual(first)
        expect(f.insert.execute).toHaveBeenCalledTimes(1)
        expect(f.rows[0].workspaceIds).toEqual([f.scope.workspaceId])
        expect(first.configuration).toEqual({
            profileVersion: '1',
            executionEnvironment: { type: 'computer' },
            managedRuntime: { type: 'builtin', version: '1' }
        })
    })
    it('rejects absent/foreign workspace, caller access denial and model/Computer denial before writing', async () => {
        const f = fixture()
        await expect(f.service.resolve({ ...f.scope, workspaceId: undefined }, f.selection)).rejects.toThrow()
        f.queries.execute.mockRejectedValueOnce(new Error('Assistant access revoked'))
        await expect(f.service.resolve(f.scope, f.selection)).rejects.toThrow('Assistant access revoked')
        f.commands.execute.mockRejectedValueOnce(new Error('Computer denied'))
        await expect(f.service.resolve(f.scope, f.selection)).rejects.toThrow('Computer denied')
        f.workspace.findOneBy.mockResolvedValueOnce(null)
        await expect(f.service.resolve(f.scope, f.selection)).rejects.toThrow()
        expect(f.insert.execute).not.toHaveBeenCalled()
    })
    it('rejects unsupported CLI versions, unknown targets and injected configuration', async () => {
        const f = fixture()
        f.commands.execute.mockResolvedValueOnce({
            tools: [{ id: 'test', version: '2.0.0' }],
            modelSourceId: f.scope.callerXpertId
        })
        await expect(f.service.resolve(f.scope, f.selection)).rejects.toThrow()
        await expect(f.service.resolve(f.scope, { ...f.selection, reference: 'unknown' })).rejects.toThrow()
        await expect(
            f.service.resolve(f.scope, { ...f.selection, command: 'anything' } as typeof f.selection)
        ).rejects.toThrow()
        expect(f.insert.execute).not.toHaveBeenCalled()
    })
    it('never re-enables a disabled binding, including after a preset revision upgrade', async () => {
        const f = fixture()
        const old = await f.service.resolve(f.scope, f.selection)
        f.profile.version = '2'
        const next = await f.service.resolve(f.scope, f.selection)
        expect(next.bindingId).not.toBe(old.bindingId)
        expect(f.rows[0].target).toEqual(old)
        f.rows[0].enabled = false
        expect(await f.service.list(f.scope)).toEqual([])
        await expect(f.service.resolve(f.scope, f.selection)).rejects.toThrow()
        await expect(f.service.assertEnabled(f.scope, f.rows[1])).rejects.toThrow()
        expect(f.rows).toHaveLength(2)
    })
    it('does not reuse or import grants from old configured bindings', async () => {
        const f = fixture()
        await f.service.resolve(f.scope, f.selection)
        const old = f.rows[0]
        old.id = randomUUID()
        old.target.bindingId = old.id
        delete old.target.configuration.managedRuntime
        old.workspaceIds = [randomUUID()]
        old.enabled = false
        expect(await f.service.list(f.scope)).toHaveLength(1)
        const target = await f.service.resolve(f.scope, f.selection)
        expect(target.bindingId).not.toBe(old.id)
        expect(target.configuration.managedRuntime).toEqual({ type: 'builtin', version: '1' })
        expect(f.rows).toHaveLength(2)
        expect(old.enabled).toBe(false)
    })
    it('separates project model sources and refuses unsupported pipelines', async () => {
        const f = fixture()
        const scope = {
            ...f.scope,
            callerType: 'project_agent' as const,
            callerXpertId: undefined,
            projectId: randomUUID()
        }
        const first = await f.service.resolve(scope, f.selection)
        const other = randomUUID()
        f.commands.execute.mockResolvedValueOnce({ tools: [{ id: 'test', version: '1.0.0' }], modelSourceId: other })
        const second = await f.service.resolve(scope, f.selection)
        expect(second.bindingId).not.toBe(first.bindingId)
        expect(second.configuration.modelSource).toEqual({ type: 'assistant', xpertId: other })
        await expect(f.service.resolve({ ...scope, callerType: 'project_pipeline' }, f.selection)).rejects.toThrow()
    })
    it('has deterministic distinct keys across tenant, organization, workspace, profile revision and model source', () => {
        const parts = ['tenant', 'org', 'workspace', 'provider', 'profile', '1', 'source']
        expect(managedBindingId(parts)).toBe(managedBindingId([...parts]))
        for (let i = 0; i < parts.length; i++) {
            const next = [...parts]
            next[i] += '-other'
            expect(managedBindingId(next)).not.toBe(managedBindingId(parts))
        }
    })
})
