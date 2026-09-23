jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { DiscoveryService, Reflector } from '@nestjs/core'
import { QueryBus } from '@nestjs/cqrs'
import {
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
    const factory = new AgentInvocationFactoryService(
        repository as unknown as Repository<AgentRuntimeBindingEntity>,
        query as unknown as QueryBus,
        runtime,
        new DefaultRuntimeCapabilityRegistry().register(ProjectAccessRuntimeCapability, projects)
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
        identity,
        api: factory.createScopedApi(identity),
        registry
    }
}

describe('Agent invocation factory and controller boundaries', () => {
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
