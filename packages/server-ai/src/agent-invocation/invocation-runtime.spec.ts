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
import { AgentInvocationNotStartedError } from './invocation-errors'
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
    it('fences intermediate launch receipts across runtime instances and inspects immediately after start returns', async () => {
        const f = fixture()
        f.start.mockImplementation(async (_request, context) => {
            await context.checkpoint({ status: 'running', handle: { sessionId: 'pending', runId: 'run' } })
            const other = new AgentInvocationRuntime(f.store, f.registry).scoped(f.access)
            const observed = await other.inspect(context.invocationId)
            expect(observed.status).toBe('running')
            expect(observed.startPendingUntil).toBeDefined()
            expect(f.strategy.inspect).not.toHaveBeenCalled()
            return { status: 'running', handle: { sessionId: 'ready', runId: 'run' } }
        })
        const started = await f.api.start(f.request)
        expect(started.startPendingUntil).toBeUndefined()
        await f.api.inspect(started.id)
        expect(f.strategy.inspect).toHaveBeenCalledTimes(1)
    })

    it('expires an abandoned startup fence without relaunching work', async () => {
        const f = fixture()
        f.start.mockImplementation(async (_request, context) => {
            await context.checkpoint({ status: 'running', handle: { sessionId: 'pending', runId: 'run' } })
            f.store.rows.get(context.invocationId).invocation.startPendingUntil = new Date(0).toISOString()
            jest.mocked(f.strategy.inspect).mockResolvedValue({ status: 'unknown' })
            const other = new AgentInvocationRuntime(f.store, f.registry).scoped(f.access)
            expect((await other.inspect(context.invocationId)).status).toBe('unknown')
            expect((await other.start(f.request)).status).toBe('unknown')
            return { status: 'running' }
        })
        expect((await f.api.start(f.request)).status).toBe('unknown')
        expect(f.strategy.inspect).toHaveBeenCalledTimes(1)
        expect(f.start).toHaveBeenCalledTimes(1)
    })

    it('marks an expired startup without a receipt unknown and never replays it', async () => {
        const f = fixture()
        f.start.mockImplementation(async (_request, context) => {
            f.store.rows.get(context.invocationId).invocation.startPendingUntil = new Date(0).toISOString()
            expect((await f.api.inspect(context.invocationId)).status).toBe('unknown')
            expect((await f.api.start(f.request)).status).toBe('unknown')
            return { status: 'running' }
        })
        expect((await f.api.start(f.request)).status).toBe('unknown')
        expect(f.strategy.inspect).not.toHaveBeenCalled()
        expect(f.start).toHaveBeenCalledTimes(1)
    })

    it('allows cancellation during the startup fence and preserves it when start returns', async () => {
        const f = fixture()
        f.start.mockImplementation(async (_request, context) => {
            await context.checkpoint({ status: 'running', handle: { sessionId: 'pending', runId: 'run' } })
            expect((await f.api.cancel(context.invocationId)).status).toBe('cancelling')
            return { status: 'running' }
        })
        expect((await f.api.start(f.request)).status).toBe('cancelling')
        expect(f.strategy.cancel).toHaveBeenCalledTimes(1)
    })

    const dispatch = {
        version: 1 as const,
        requestId: '00000000-0000-4000-8000-000000000001',
        sourceMessageId: 'source-message',
        replyTo: {
            xpertId: '00000000-0000-4000-8000-000000000002',
            agentKey: 'main',
            conversationId: '00000000-0000-4000-8000-000000000003',
            threadId: 'thread'
        }
    }

    it('recovers a queued reservation once and never relaunches a running record without a receipt', async () => {
        const f = fixture()
        const admitted = await f.api.start(f.request)
        const record = f.store.rows.get(admitted.id)
        record.invocation.status = 'queued'
        f.start.mockClear().mockResolvedValue({ status: 'running' })
        const receipts = await Promise.all([f.api.start(f.request), f.api.start(f.request)])
        expect(f.start).toHaveBeenCalledTimes(1)
        expect(receipts.every((receipt) => receipt.id === admitted.id)).toBe(true)
        await f.api.start(f.request)
        expect(f.start).toHaveBeenCalledTimes(1)
    })
    it('pins reply metadata in the existing invocation identity without sending it to the adapter', async () => {
        const f = fixture()
        const request = { ...f.request, dispatch }
        const first = await f.api.start(request)
        expect(first.request.dispatch).toEqual(dispatch)
        expect(await f.api.start(request)).toEqual(first)
        expect(f.start).toHaveBeenCalledTimes(1)
        expect(f.start.mock.calls[0][0]).not.toHaveProperty('dispatch')
        await expect(
            f.api.start({ ...request, dispatch: { ...dispatch, sourceMessageId: 'changed' } })
        ).rejects.toThrow()
        expect(f.start).toHaveBeenCalledTimes(1)
    })

    it('rejects malformed reply metadata before reservation or launch', async () => {
        const f = fixture()
        await expect(f.api.start({ ...f.request, dispatch: { ...dispatch, requestId: 'invalid' } })).rejects.toThrow()
        expect(f.store.rows.size).toBe(0)
        expect(f.start).not.toHaveBeenCalled()
    })

    it('persists reported progress without converting it to a successful result or business completion', async () => {
        const f = fixture()
        const progress = {
            source: 'executor' as const,
            observedAt: '2026-10-06T01:00:00Z',
            phase: 'Testing',
            steps: { completed: 3, total: 5 }
        }
        f.start.mockResolvedValue({ status: 'running', progress, handle: { sessionId: 'session', runId: 'run' } })
        const started = await f.api.start(f.request)
        expect(started.progress).toEqual(progress)
        expect(started.status).toBe('running')
        expect(started.result).toBeUndefined()
        expect((await f.api.inspect(started.id)).progress).toEqual(progress)
    })

    it('records a verified preflight failure as terminal, without replaying the same request', async () => {
        const f = fixture()
        f.start.mockRejectedValue(new AgentInvocationNotStartedError('Coding tool missing'))
        const result = await f.api.start(f.request)
        expect(result.status).toBe('failed')
        expect(result.error).toBe('Coding tool missing')
        expect(await f.api.start(f.request)).toEqual(result)
        expect(f.start).toHaveBeenCalledTimes(1)
    })

    it('never treats a saved launch receipt as a preflight failure', async () => {
        const f = fixture()
        f.start.mockImplementation(async (_request, context) => {
            await context.checkpoint({ status: 'running', handle: { sessionId: 'session', runId: 'run' } })
            throw new AgentInvocationNotStartedError('Too late to assert preflight')
        })
        await expect(f.api.start(f.request)).rejects.toThrow()
        expect([...f.store.rows.values()][0].invocation.status).toBe('unknown')
    })

    it('does not accept an impossible progress count from an adapter', async () => {
        const f = fixture()
        f.start.mockResolvedValue({
            status: 'running',
            progress: {
                source: 'executor',
                observedAt: '2026-10-06T01:00:00Z',
                steps: { completed: 6, total: 5 }
            }
        })
        await expect(f.api.start(f.request)).rejects.toThrow()
        expect([...f.store.rows.values()][0].invocation.progress).toBeUndefined()
        expect([...f.store.rows.values()][0].invocation.status).toBe('unknown')
    })

    it('rejects invalid delivery paths before reserving or starting a task', async () => {
        const f = fixture()
        await expect(
            f.api.start({
                ...f.request,
                input: { prompt: 'task', delivery: { mode: 'archive', paths: ['../secret'] } }
            })
        ).rejects.toThrow()
        expect(f.store.rows.size).toBe(0)
        expect(f.start).not.toHaveBeenCalled()
    })

    it('persists typed findings and an export failure without changing task success', async () => {
        const f = fixture()
        const result = {
            text: 'Tests passed; export failed',
            items: [
                { type: 'tests' as const, id: 'tests', title: 'Tests', summary: 'Passed', status: 'passed' as const }
            ],
            export: { mode: 'archive' as const, status: 'failed' as const, error: 'Collection failed' }
        }
        f.start.mockResolvedValue({ status: 'succeeded', result })
        const run = await f.api.start({
            ...f.request,
            input: { prompt: 'task', delivery: { mode: 'archive', paths: ['report.txt'] } }
        })
        expect(run.status).toBe('succeeded')
        expect((await f.api.inspect(run.id)).result).toEqual(result)
    })
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
