jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { DiscoveryService, Reflector } from '@nestjs/core'
import { AgentInvocationRuntime } from './invocation-runtime'
import { MemoryInvocationStore } from './invocation-test-store'
import {
    AgentRuntimeRegistry,
    DefaultRuntimeCapabilityRegistry,
    IAgentRuntimeStrategy,
    AgentRuntimeContext,
    AgentRuntimeObservation,
    AgentInvocationRequest
} from '@xpert-ai/plugin-sdk'
import { ExecutionControlEvidence } from '@xpert-ai/contracts'
import { invocationCanRelease } from './invocation-control-evidence'

function fixture(supported = true) {
    const store = new MemoryInvocationStore()
    const registry = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
    const start = jest.fn(async () => ({
        status: 'running' as const,
        handle: { sessionId: 'session', runId: 'original' }
    }))
    const inspect = jest
        .fn<Promise<AgentRuntimeObservation>, [unknown, AgentRuntimeContext]>()
        .mockResolvedValue({ status: 'running' })
    const cancel = jest
        .fn<Promise<AgentRuntimeObservation>, [unknown, AgentRuntimeContext]>()
        .mockResolvedValue({ status: 'cancelled' })
    const strategy: IAgentRuntimeStrategy = {
        capabilities: {
            recovery: 'session',
            interactions: false,
            cancellation: true,
            background: true,
            ...(supported ? { completionEvidence: 1 } : {})
        },
        start,
        inspect,
        cancel
    }
    registry.register('test', strategy, { kind: 'builtin', scopeKey: 'builtin:global' })
    const runtime = new AgentInvocationRuntime(store, registry)
    const access = {
        scope: {
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'user',
            parentExecutionId: 'parent',
            callerAgentKey: 'main'
        },
        capabilities: new DefaultRuntimeCapabilityRegistry(),
        authorize: async () => undefined
    }
    const request: AgentInvocationRequest = {
        callId: 'once',
        target: { bindingId: 'binding', provider: 'test', revision: '1', reference: 'r', configuration: {} },
        input: { prompt: 'work' }
    }
    return { store, registry, runtime, access, request, strategy, start, inspect, cancel, api: runtime.scoped(access) }
}
function receipt(id: string, outcome: 'cancelled' | 'succeeded' = 'cancelled'): ExecutionControlEvidence {
    return {
        version: 1,
        source: 'provider',
        subject: { kind: 'invocation', id },
        scope: 'operation',
        state: 'settled',
        outcome,
        sessionId: 'session',
        runId: 'original',
        receiptKey: 'original-exited',
        observedAt: new Date().toISOString()
    }
}

describe('Invocation completion evidence', () => {
    it('waits after acceptance, then reconciles an actual exit across replicas without relaunching', async () => {
        const f = fixture()
        const started = await f.api.start(f.request)
        expect((await f.api.cancel(started.id)).status).toBe('cancelling')
        const other = new AgentInvocationRuntime(f.store, f.registry).scoped(f.access)
        f.inspect.mockResolvedValue({ status: 'cancelled' })
        expect(invocationCanRelease(await other.inspect(started.id))).toBe(false)
        f.inspect.mockResolvedValue({ status: 'cancelled', controlEvidence: receipt(started.id) })
        const results = await Promise.all([
            other.inspect(started.id),
            f.api.inspect(started.id),
            f.api.start(f.request)
        ])
        expect(invocationCanRelease(await other.inspect(started.id))).toBe(true)
        expect(results.every((item) => item.id === started.id)).toBe(true)
        expect(f.start).toHaveBeenCalledTimes(1)
        expect(f.cancel).toHaveBeenCalledTimes(1)
    })

    it('does not grant legacy providers completion support from a cancelled string', async () => {
        const f = fixture(false),
            started = await f.api.start(f.request)
        expect(await f.api.cancel(started.id)).toMatchObject({
            status: 'cancelling',
            controlEvidence: { source: 'unavailable', reason: 'unsupported' }
        })
        f.inspect.mockResolvedValue({ status: 'cancelled', controlEvidence: receipt(started.id) })
        await expect(f.api.inspect(started.id)).rejects.toMatchObject({ code: 'InvalidRequest' })
        expect(invocationCanRelease(f.store.rows.get(started.id).invocation)).toBe(false)
    })

    it.each(['invocation', 'run', 'session', 'outcome', 'host'] as const)(
        'rejects mismatched or forged %s evidence',
        async (kind) => {
            const f = fixture(),
                started = await f.api.start(f.request)
            await f.api.cancel(started.id)
            const proof = receipt(started.id)
            if (proof.source !== 'provider') throw Error('Fixture type')
            const controlEvidence: ExecutionControlEvidence =
                kind === 'host'
                    ? {
                          version: 1,
                          source: 'host_admission',
                          subject: proof.subject,
                          scope: 'operation',
                          state: 'settled',
                          outcome: 'cancelled',
                          reason: 'not_started',
                          observedAt: proof.observedAt
                      }
                    : {
                          ...proof,
                          ...(kind === 'invocation' ? { subject: { kind: 'invocation', id: 'other' } } : {}),
                          ...(kind === 'run' ? { runId: 'other' } : {}),
                          ...(kind === 'session' ? { sessionId: 'other' } : {}),
                          ...(kind === 'outcome' ? { outcome: 'succeeded' } : {})
                      }
            f.inspect.mockResolvedValue({ status: 'cancelled', controlEvidence })
            await expect(f.api.inspect(started.id)).rejects.toMatchObject({ code: 'InvalidRequest' })
            expect(invocationCanRelease(f.store.rows.get(started.id).invocation)).toBe(false)
        }
    )

    it('does not let a later observation replace the pinned operation before supplying proof', async () => {
        const f = fixture(),
            started = await f.api.start(f.request)
        await f.api.cancel(started.id)
        f.inspect.mockResolvedValue({ status: 'running', handle: { sessionId: 'session', runId: 'another-turn' } })
        await expect(f.api.inspect(started.id)).rejects.toMatchObject({ code: 'InvalidRequest' })
        expect(f.store.rows.get(started.id).invocation.handle.runId).toBe('original')
    })

    it('keeps the original outcome while waiting for its completion evidence after cancellation', async () => {
        const f = fixture(),
            started = await f.api.start(f.request)
        await f.api.cancel(started.id)
        f.inspect.mockResolvedValue({ status: 'succeeded', result: { text: 'saved once' } })
        expect(await f.api.inspect(started.id)).toMatchObject({ status: 'cancelling', result: { text: 'saved once' } })
        f.inspect.mockResolvedValue({
            status: 'succeeded',
            result: { text: 'saved once' },
            controlEvidence: receipt(started.id, 'succeeded')
        })
        expect(await f.api.inspect(started.id)).toMatchObject({ status: 'succeeded', result: { text: 'saved once' } })
        expect(f.start).toHaveBeenCalledTimes(1)
    })

    it('reconciles legacy terminal cancellation without allowing start to replay it', async () => {
        const f = fixture(),
            started = await f.api.start(f.request)
        const old = f.store.rows.get(started.id).invocation
        old.status = 'cancelled'
        expect(invocationCanRelease(old)).toBe(false)
        await f.api.start(f.request)
        f.inspect.mockResolvedValue({ status: 'cancelled' })
        expect((await f.api.inspect(started.id)).status).toBe('cancelling')
        f.inspect.mockResolvedValue({ status: 'cancelled', controlEvidence: receipt(started.id) })
        expect(invocationCanRelease(await f.api.inspect(started.id))).toBe(true)
        expect(f.start).toHaveBeenCalledTimes(1)
    })
    it('does not fabricate unstarted proof when a queued cancellation loses the launch CAS', async () => {
        const f = fixture(),
            started = await f.api.start(f.request)
        // Reconstruct a reserved row; the competing launch wins exactly before cancellation's CAS.
        const reserved = f.store.rows.get(started.id).invocation
        reserved.status = 'queued'
        reserved.handle = undefined
        const replace = f.store.replace.bind(f.store)
        jest.spyOn(f.store, 'replace').mockImplementationOnce(async (record, revision) => {
            expect(record.invocation.controlEvidence).toMatchObject({ source: 'host_admission' })
            const row = f.store.rows.get(started.id).invocation
            row.status = 'running'
            row.handle = { sessionId: 'session', runId: 'original' }
            row.revision++
            return replace(record, revision)
        })
        const result = await f.api.cancel(started.id)
        expect(result.status).toBe('cancelling')
        expect(result.controlEvidence?.source).not.toBe('host_admission')
        expect(f.cancel).toHaveBeenCalledTimes(1)
        expect(f.start).toHaveBeenCalledTimes(1)
    })

    it('confirms cancellation of an unclaimed reservation without invoking the provider', async () => {
        const f = fixture(),
            started = await f.api.start(f.request)
        const reserved = f.store.rows.get(started.id).invocation
        reserved.status = 'queued'
        reserved.handle = undefined
        expect(await f.api.cancel(started.id)).toMatchObject({
            status: 'cancelled',
            controlEvidence: { source: 'host_admission' }
        })
        expect(f.cancel).not.toHaveBeenCalled()
        await f.api.start(f.request)
        expect(f.start).toHaveBeenCalledTimes(1)
    })
})
