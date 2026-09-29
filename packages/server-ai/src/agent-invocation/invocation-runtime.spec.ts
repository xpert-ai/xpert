jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { DiscoveryService, Reflector } from '@nestjs/core'
import {
    AgentInvocationRequest,
    AgentInvocationScope,
    AgentRuntimeRegistry,
    DefaultRuntimeCapabilityRegistry,
    IAgentRuntimeStrategy,
    BUILTIN_GLOBAL_SCOPE,
    AgentRuntimeObservation
} from '@xpert-ai/plugin-sdk'
import { AgentInvocationRuntime } from './invocation-runtime'
import { MemoryInvocationStore } from './invocation-test-store'

function fixture() {
    const store = new MemoryInvocationStore()
    const registry = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
    const start = jest
        .fn<Promise<AgentRuntimeObservation>, Parameters<IAgentRuntimeStrategy['start']>>()
        .mockResolvedValue({ status: 'succeeded', result: { text: 'done' } })
    const strategy: IAgentRuntimeStrategy = {
        capabilities: { recovery: 'checkpoint', interactions: true, cancellation: true, background: true },
        start,
        inspect: jest.fn().mockResolvedValue({ status: 'running' }),
        cancel: jest.fn().mockResolvedValue({ status: 'cancelling' }),
        respond: jest.fn().mockResolvedValue({ status: 'running' })
    }
    registry.register('test', strategy, { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE })
    const runtime = new AgentInvocationRuntime(store, registry)
    const scope: AgentInvocationScope = {
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'user',
        parentExecutionId: 'parent',
        callerAgentKey: 'leader'
    }
    const access = {
        scope,
        capabilities: new DefaultRuntimeCapabilityRegistry(),
        authorize: jest.fn().mockResolvedValue(undefined),
        isSuspension: (error: unknown) => error instanceof Error && error.message === 'checkpoint'
    }
    const request: AgentInvocationRequest = {
        callId: 'call-1',
        target: { bindingId: 'binding', provider: 'test', reference: 'agent', revision: '1', configuration: {} },
        input: { prompt: 'task' }
    }
    return { store, registry, runtime, scope, access, request, strategy, start, api: runtime.scoped(access) }
}

describe('AgentInvocationRuntime', () => {
    it('reserves before dispatch and replays a completed result without restarting', async () => {
        const f = fixture()
        f.start.mockImplementation(async (request) => {
            expect(f.store.rows.get(request.operationId)?.invocation.status).toBe('running')
            return { status: 'succeeded', result: { text: 'done' } }
        })
        const first = await f.api.start(f.request)
        expect(await f.api.start(f.request)).toEqual(first)
        expect(f.start).toHaveBeenCalledTimes(1)
        expect(f.access.authorize).toHaveBeenCalledTimes(2)
    })

    it('does not launch twice for concurrent calls', async () => {
        const f = fixture()
        const results = await Promise.all([f.api.start(f.request), f.api.start(f.request)])
        expect(new Set(results.map((value) => value.id)).size).toBe(1)
        expect(f.start).toHaveBeenCalledTimes(1)
    })

    it('rejects reuse with a changed target revision or input', async () => {
        const f = fixture()
        await f.api.start(f.request)
        await expect(f.api.start({ ...f.request, target: { ...f.request.target, revision: '2' } })).rejects.toThrow()
        await expect(f.api.start({ ...f.request, input: { prompt: 'different' } })).rejects.toThrow()
        expect(f.start).toHaveBeenCalledTimes(1)
    })

    it('persists receipt before an ambiguous error and never blindly restarts', async () => {
        const f = fixture()
        f.start.mockImplementation(async (_, context) => {
            await context.checkpoint({ status: 'running', handle: { sessionId: 'session', runId: 'run' } })
            throw new Error('connection lost')
        })
        await expect(f.api.start(f.request)).rejects.toThrow('connection lost')
        const run = await f.api.start(f.request)
        expect(run.status).toBe('unknown')
        expect(run.handle?.runId).toBe('run')
        expect(f.start).toHaveBeenCalledTimes(1)
    })

    it('reuses the invocation identity on checkpoint resume', async () => {
        const f = fixture()
        f.start.mockRejectedValueOnce(new Error('checkpoint'))
        await expect(f.api.start(f.request)).rejects.toThrow('checkpoint')
        const invocationId = [...f.store.rows.keys()][0]
        expect((await f.api.start(f.request)).id).toBe(invocationId)
        expect(f.start).toHaveBeenCalledTimes(2)
    })

    it('does not turn session continuation into checkpoint replay', async () => {
        const f = fixture()
        f.strategy.capabilities.recovery = 'session'
        f.start.mockResolvedValue({ status: 'waiting', interaction: { id: 'approval', kind: 'approval', prompt: '?' } })
        await f.api.start(f.request)
        await f.api.start(f.request)
        expect(f.start).toHaveBeenCalledTimes(1)
    })

    it('rejects access after revocation, including cached results', async () => {
        const f = fixture()
        const run = await f.api.start(f.request)
        f.access.authorize.mockRejectedValue(new Error('revoked'))
        await expect(f.api.start(f.request)).rejects.toThrow('revoked')
        await expect(f.api.inspect(run.id)).rejects.toThrow('revoked')
    })

    it('rejects guessed invocation ids from another actor or caller', async () => {
        const f = fixture()
        const run = await f.api.start(f.request)
        for (const override of [{ userId: 'other' }, { organizationId: 'other' }, { parentExecutionId: 'other' }]) {
            const api = f.runtime.scoped({ ...f.access, scope: { ...f.scope, ...override } })
            await expect(api.inspect(run.id)).rejects.toThrow()
        }
    })

    it('pins strategy provenance without silently falling back', async () => {
        const f = fixture()
        f.registry.register('test', f.strategy, {
            kind: 'plugin',
            pluginName: 'driver',
            pluginVersion: '1',
            scopeKey: 'org'
        })
        const run = await f.api.start(f.request)
        f.registry.unregister('test', { kind: 'plugin', pluginName: 'driver', pluginVersion: '1', scopeKey: 'org' })
        await expect(f.api.inspect(run.id)).rejects.toThrow()
    })

    it('claims an interaction once and rejects stale answers', async () => {
        const f = fixture()
        f.start.mockResolvedValue({
            status: 'waiting',
            handle: { sessionId: 's', runId: 'r' },
            interaction: { id: 'approve', kind: 'approval', prompt: 'Proceed?' }
        })
        const run = await f.api.start(f.request)
        expect((await f.api.respond(run.id, 'approve', true)).status).toBe('running')
        await expect(f.api.respond(run.id, 'approve', true)).rejects.toThrow()
        expect(f.strategy.respond).toHaveBeenCalledTimes(1)
    })

    it('keeps cancellation pending until the provider confirms it', async () => {
        const f = fixture()
        f.start.mockResolvedValue({ status: 'running', handle: { sessionId: 's', runId: 'r' } })
        const run = await f.api.start(f.request)
        expect((await f.api.cancel(run.id)).status).toBe('cancelling')
    })
    it('does not let a start receipt overwrite a newer approval checkpoint', async () => {
        const f = fixture()
        f.start.mockImplementation(async (_, context) => {
            await context.checkpoint({
                status: 'waiting',
                handle: { sessionId: 's', runId: 'r' },
                interaction: { id: 'approve', kind: 'approval', prompt: 'Proceed?' }
            })
            return { status: 'running', handle: { sessionId: 's', runId: 'r' } }
        })
        expect((await f.api.start(f.request)).status).toBe('waiting')
    })

    it('preserves cancellation intent through a late running observation', async () => {
        const f = fixture()
        f.start.mockResolvedValue({ status: 'running', handle: { sessionId: 's', runId: 'r' } })
        const run = await f.api.start(f.request)
        await f.api.cancel(run.id)
        expect((await f.api.inspect(run.id)).status).toBe('cancelling')
    })
})
