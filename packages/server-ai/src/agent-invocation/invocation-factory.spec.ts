jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { DiscoveryService, Reflector } from '@nestjs/core'
import { QueryBus } from '@nestjs/cqrs'
import {
    AgentExecutionRunner,
    AgentExecutionRunnerCapability,
    AgentExecutionRunnerFactoryCapability,
    AgentInvocationScope,
    AgentRunnerReceipt,
    AgentRuntimeRegistry,
    BUILTIN_GLOBAL_SCOPE,
    IAgentRuntimeStrategy,
    RuntimeIdentityScope,
    RequestContext,
    DefaultRuntimeCapabilityRegistry,
    ProjectAccessRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { AgentInvocationFactoryService } from './invocation-factory.service'
import { AgentInvocationEntity, AgentRuntimeBindingEntity } from './invocation.entity'
import { AgentInvocationRuntime } from './invocation-runtime'
import { MemoryInvocationStore } from './invocation-test-store'
import { AgentInvocationsController } from './invocations.controller'
import { AgentRuntimeBindingsController } from './runtime-bindings.controller'
import { NativeAgentInvocationReader } from './native-invocation-reader'

const bindingId = '00000000-0000-4000-8000-000000000010'

function fixture() {
    const binding = {
        enabled: true,
        workspaceIds: ['workspace'],
        target: {
            bindingId,
            provider: 'remote',
            reference: 'profile',
            revision: '1',
            configuration: { profileVersion: '1' }
        }
    }
    const repository = { findOneBy: jest.fn(async () => (binding.enabled ? binding : null)) }
    const query = {
        execute: jest.fn(async () => ({
            agent: { team: { tenantId: 'tenant', organizationId: 'org', workspaceId: 'workspace' } }
        }))
    }
    const provider: IAgentRuntimeStrategy = {
        capabilities: { recovery: 'session', interactions: false, cancellation: false, background: true },
        start: jest.fn(async () => ({ status: 'succeeded' as const, result: { text: 'done' } })),
        inspect: jest.fn()
    }
    const registry = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
    registry.register('remote', provider, { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE })
    const runtime = new AgentInvocationRuntime(new MemoryInvocationStore(), registry)
    const projects = { assertEdit: jest.fn(), assertManage: jest.fn(), listReadable: jest.fn() }
    const capabilities = new DefaultRuntimeCapabilityRegistry().register(ProjectAccessRuntimeCapability, projects)
    const factory = new AgentInvocationFactoryService(
        repository as unknown as Repository<AgentRuntimeBindingEntity>,
        query as unknown as QueryBus,
        runtime,
        capabilities
    )
    const identity: RuntimeIdentityScope = {
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'user',
        workspaceId: 'workspace',
        xpertId: 'assistant',
        executionId: 'parent',
        agentKey: 'leader'
    }
    return {
        binding,
        repository,
        query,
        provider,
        factory,
        projects,
        capabilities,
        identity,
        api: factory.createScopedApi(identity),
        registry
    }
}

function runnerFixture(scope: Readonly<AgentInvocationScope>) {
    return {
        start: jest.fn(async (invocationId: string, checkpoint: (receipt: AgentRunnerReceipt) => Promise<void>) => {
            const receipt: AgentRunnerReceipt = {
                version: 1,
                invocationId,
                environment: { type: 'sandbox', environmentId: 'environment', instanceId: `instance-${scope.userId}` },
                processId: `process-${invocationId}`,
                grantId: `grant-${invocationId}`,
                workingDirectory: '/workspace',
                tool: { id: 'test-worker', version: '1' }
            }
            await checkpoint(receipt)
            return receipt
        }),
        inspect: jest.fn(async () => ({ state: 'running' as const })),
        request: jest.fn(async () => ({})),
        collectArtifacts: jest.fn(async () => []),
        stop: jest.fn(async () => ({ state: 'exited' as const }))
    } satisfies AgentExecutionRunner
}

describe('Agent invocation factory and controller boundaries', () => {
    it('keeps the runner optional and does not expose global capabilities to runtime strategies', async () => {
        const f = fixture()
        f.capabilities.register('host-only', { secretReference: 'private' })
        await f.api.start({ target: await f.api.resolve(bindingId), callId: 'without-runner', input: { prompt: 'x' } })
        const context = jest.mocked(f.provider.start).mock.calls[0][1]
        expect(context.capabilities.has(AgentExecutionRunnerCapability)).toBe(false)
        expect(context.capabilities.has(AgentExecutionRunnerFactoryCapability)).toBe(false)
        expect(context.capabilities.has('host-only')).toBe(false)
    })

    it('isolates runner scopes for concurrent users and Assistants, and recreates them when inspecting', async () => {
        const f = fixture()
        const scopes: Readonly<AgentInvocationScope>[] = []
        const runners: ReturnType<typeof runnerFixture>[] = []
        f.capabilities.register('host-only', {})
        f.capabilities.register(AgentExecutionRunnerFactoryCapability, {
            createScopedRunner(scope) {
                expect(Object.isFrozen(scope)).toBe(true)
                expect(Reflect.set(scope, 'userId', 'injected')).toBe(false)
                scopes.push(scope)
                const runner = runnerFixture(scope)
                runners.push(runner)
                return runner
            }
        })
        jest.mocked(f.provider.start).mockImplementation(async (request, context) => {
            expect(context.capabilities.has(AgentExecutionRunnerFactoryCapability)).toBe(false)
            expect(context.capabilities.has('host-only')).toBe(false)
            const runner = context.capabilities.require(AgentExecutionRunnerCapability)
            const receipt = await runner.start(context.invocationId, async (receipt) => {
                await context.checkpoint({
                    status: 'running',
                    handle: { sessionId: 'pending', runId: request.operationId, runner: receipt }
                })
            })
            return { status: 'running', handle: { sessionId: 'session', runId: request.operationId, runner: receipt } }
        })
        jest.mocked(f.provider.inspect).mockImplementation(async (handle, context) => {
            if (!handle.runner) throw new Error('Expected runner receipt')
            await context.capabilities.require(AgentExecutionRunnerCapability).inspect(handle.runner)
            return { status: 'running', handle }
        })
        const other = f.factory.createScopedApi({
            ...f.identity,
            userId: 'other-user',
            xpertId: 'other-assistant',
            executionId: 'other-parent'
        })
        // API construction captures identity; later caller mutation cannot retarget it.
        f.identity.userId = 'mutated-user'
        const target = await f.api.resolve(bindingId)
        const [first, second] = await Promise.all([
            f.api.start({ target, callId: 'first', input: { prompt: 'x' } }),
            other.start({ target, callId: 'second', input: { prompt: 'y' } })
        ])
        expect(
            scopes.map(({ userId, callerXpertId, parentExecutionId }) => [userId, callerXpertId, parentExecutionId])
        ).toEqual([
            ['user', 'assistant', 'parent'],
            ['other-user', 'other-assistant', 'other-parent']
        ])
        expect(first.handle.runner).toMatchObject({ invocationId: first.id, tool: { id: 'test-worker' } })
        expect(second.handle.runner).toMatchObject({ invocationId: second.id, environment: { type: 'sandbox' } })
        expect(first.handle.runner.grantId).not.toBe(second.handle.runner.grantId)
        expect(runners[0]).not.toBe(runners[1])
        await f.api.inspect(first.id)
        expect(scopes[2]).toEqual(scopes[0])
        expect(runners[2]).not.toBe(runners[0])
        expect(runners[2].inspect).toHaveBeenCalledWith(first.handle.runner)
        expect(runners[0].inspect).not.toHaveBeenCalled()
        await expect(other.inspect(first.id)).rejects.toThrow()
        expect(f.provider.inspect).toHaveBeenCalledTimes(1)
    })

    it('rejects modified bindings before any runner launch', async () => {
        const f = fixture()
        const runner = runnerFixture({
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'user',
            parentExecutionId: 'parent',
            callerAgentKey: 'leader'
        })
        f.capabilities.register(AgentExecutionRunnerFactoryCapability, { createScopedRunner: () => runner })
        await expect(
            f.api.start({
                target: { ...(await f.api.resolve(bindingId)), configuration: { profileVersion: 'injected' } },
                callId: 'invalid',
                input: { prompt: 'x' }
            })
        ).rejects.toThrow()
        expect(f.provider.start).not.toHaveBeenCalled()
        expect(runner.start).not.toHaveBeenCalled()
    })

    it('resolves workspace-authorized immutable bindings and rejects modified configuration', async () => {
        const f = fixture()
        const target = await f.api.resolve(bindingId)
        await expect(
            f.api.start({
                target: { ...target, configuration: { profileVersion: 'injected' } },
                callId: 'one',
                input: { prompt: 'x' }
            })
        ).rejects.toThrow()
        expect(f.provider.start).not.toHaveBeenCalled()
        expect((await f.api.start({ target, callId: 'one', input: { prompt: 'x' } })).result.text).toBe('done')
    })
    it('revalidates grants and disablement for cached invocations', async () => {
        const f = fixture()
        const request = { target: await f.api.resolve(bindingId), callId: 'one', input: { prompt: 'x' } }
        const run = await f.api.start(request)
        f.binding.enabled = false
        await expect(f.api.inspect(run.id)).rejects.toThrow()
        await expect(f.api.start(request)).rejects.toThrow()
    })
    it('compares binding configuration independently of JSONB property order', async () => {
        const f = fixture()
        f.binding.target.configuration = Object.assign(
            { profileVersion: '1' },
            { executionEnvironment: { type: 'computer' } }
        )
        const target = await f.api.resolve(bindingId)
        target.configuration = { executionEnvironment: { type: 'computer' }, profileVersion: '1' }
        await expect(f.api.start({ target, callId: 'ordered', input: { prompt: 'x' } })).resolves.toMatchObject({
            status: 'succeeded'
        })
    })
    it('fails when Assistant organization or workspace differs from caller scope', async () => {
        const f = fixture()
        const api = f.factory.createScopedApi({ ...f.identity, organizationId: 'other' })
        await expect(api.resolve(bindingId)).rejects.toThrow()
        expect(f.repository.findOneBy).not.toHaveBeenCalled()
    })
    it('revalidates project access before dispatch', async () => {
        const f = fixture()
        f.projects.assertEdit.mockRejectedValue(new Error('project access revoked'))
        const api = f.factory.createScopedApi({ ...f.identity, projectId: 'project' })
        await expect(api.resolve(bindingId)).rejects.toThrow('project access revoked')
        expect(f.provider.start).not.toHaveBeenCalled()
    })
    it('does not permit HTTP control of another owner invocation', async () => {
        const f = fixture()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('attacker')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        const records = { findOneBy: jest.fn().mockResolvedValue(null) }
        const controller = new AgentInvocationsController(
            records as unknown as Repository<AgentInvocationEntity>,
            f.factory,
            {} as NativeAgentInvocationReader
        )
        await expect(controller.cancel('11111111-1111-4111-a111-111111111111')).rejects.toThrow()
        expect(records.findOneBy).toHaveBeenCalledWith(
            expect.objectContaining({ ownerId: 'attacker', tenantId: 'tenant', organizationId: 'org' })
        )
        jest.restoreAllMocks()
    })
    it('requires an administrator before accepting a binding mutation', async () => {
        const f = fixture()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue(null)
        const controller = new AgentRuntimeBindingsController({} as Repository<AgentRuntimeBindingEntity>, f.registry)
        await expect(controller.create({})).rejects.toThrow()
        jest.restoreAllMocks()
    })
    it.each(['xpert:assistant:entry', 'assistant-task:caller:target', 'invalid'])(
        'rejects non-UUID binding %s before querying storage',
        async (id) => {
            const f = fixture()
            await expect(f.api.resolve(id)).rejects.toMatchObject({ code: 'InvalidRequest' })
            expect(f.repository.findOneBy).not.toHaveBeenCalled()
            expect(f.query.execute).not.toHaveBeenCalled()
            expect(f.provider.start).not.toHaveBeenCalled()
        }
    )
})
