jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { DiscoveryService, Reflector } from '@nestjs/core'
import {
    AgentRuntimeObservation,
    AgentRuntimeContext,
    AgentRuntimeRegistry,
    DefaultRuntimeCapabilityRegistry,
    IAgentRuntimeStrategy,
    BUILTIN_GLOBAL_SCOPE,
    AgentInvocationRequest
} from '@xpert-ai/plugin-sdk'
import { AgentInvocationRuntime } from './invocation-runtime'
import { MemoryInvocationStore } from './invocation-test-store'

function fixture(hostAffinity = true) {
    const store = new MemoryInvocationStore()
    const registryA = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
    const registryB = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
    let original: AgentRuntimeContext,
        stopped = false
    const handle = { sessionId: 'session', runId: 'turn' }
    const a: IAgentRuntimeStrategy = {
        capabilities: {
            ...(hostAffinity ? { hostAffinity: 1 as const } : {}),
            completionEvidence: 2,
            recovery: 'none',
            cancellation: true,
            idempotentCancellation: true,
            interactions: true,
            background: true
        },
        start: jest.fn(async (_input, context): Promise<AgentRuntimeObservation> => {
            original = context
            return { status: 'running', handle }
        }),
        inspect: jest.fn(async (): Promise<AgentRuntimeObservation> => ({ status: 'running', handle })),
        cancel: jest.fn(async (): Promise<AgentRuntimeObservation> => {
            if (!stopped) return { status: 'cancelling', handle }
            return {
                status: 'cancelled',
                handle,
                controlEvidence: {
                    version: 1,
                    source: 'provider',
                    scope: 'operation',
                    state: 'settled',
                    subject: { kind: 'invocation', id: original.invocationId },
                    sessionId: handle.sessionId,
                    runId: handle.runId,
                    outcome: 'cancelled',
                    target: original.executionTarget,
                    receiptKey: 'actual-exit',
                    observedAt: new Date().toISOString()
                }
            }
        }),
        respond: jest.fn(async (): Promise<AgentRuntimeObservation> => ({ status: 'running', handle }))
    }
    const b: IAgentRuntimeStrategy = {
        ...a,
        start: jest.fn(),
        inspect: jest.fn(),
        cancel: jest.fn(),
        respond: jest.fn()
    }
    registryA.register('fixture', a, { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE })
    registryB.register('fixture', b, { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE })
    const runtimeA = new AgentInvocationRuntime(store, registryA),
        runtimeB = new AgentInvocationRuntime(store, registryB)
    const access = {
        scope: {
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'user',
            parentExecutionId: 'parent',
            callerAgentKey: 'leader'
        },
        capabilities: new DefaultRuntimeCapabilityRegistry(),
        authorize: async () => undefined
    }
    const request: AgentInvocationRequest = {
        callId: 'tool',
        target: { provider: 'fixture', bindingId: 'binding', revision: '1', reference: 'profile', configuration: {} },
        input: { prompt: 'one tool execution' }
    }
    return {
        store,
        a,
        b,
        runtimeA,
        runtimeB,
        apiA: runtimeA.scoped(access),
        apiB: runtimeB.scoped(access),
        request,
        original: () => original,
        stop: () => {
            stopped = true
        }
    }
}

describe('original runtime host control', () => {
    it('delivers persisted cancellation to the original host without notifications or a second start', async () => {
        const f = fixture(),
            run = await f.apiA.start(f.request)
        expect((await f.apiB.cancel(run.id)).status).toBe('cancelling')
        expect(f.b.cancel).not.toHaveBeenCalled()
        await f.runtimeA.reconcileOwned()
        expect(f.a.cancel).toHaveBeenCalledTimes(1)
        expect((await f.apiB.inspect(run.id)).status).toBe('cancelling')
        f.stop()
        await Promise.all([f.runtimeA.reconcileOwned(), f.runtimeA.reconcileOwned(), f.runtimeB.reconcileOwned()])
        expect((await f.apiB.inspect(run.id)).status).toBe('cancelled')
        expect((await f.apiB.start(f.request)).status).toBe('cancelled')
        expect(f.a.start).toHaveBeenCalledTimes(1)
        expect(f.b.start).not.toHaveBeenCalled()
    })
    it('rejects late checkpoints and control from an old generation', async () => {
        const f = fixture(),
            run = await f.apiA.start(f.request)
        const row = f.store.rows.get(run.id)
        row.invocation.executionTarget = { version: 1, kind: 'host', hostId: randomUUID(), generation: randomUUID() }
        await expect(f.original().checkpoint({ status: 'cancelled' })).rejects.toThrow()
        await f.runtimeA.reconcileOwned()
        expect(f.a.cancel).not.toHaveBeenCalled()
        expect(f.a.inspect).not.toHaveBeenCalled()
    })
    it('keeps successful protocol results unconfirmed until the owned exit receipt arrives', async () => {
        const f = fixture(),
            run = await f.apiA.start(f.request)
        await f
            .original()
            .checkpoint({ status: 'unknown', error: '[activity_incomplete] Earlier inspection incomplete' })
        await f.original().checkpoint({ status: 'succeeded', handle: run.handle, result: { text: 'business done' } })
        expect(f.store.rows.get(run.id).invocation).toMatchObject({
            status: 'unknown',
            result: { text: 'business done' }
        })
        expect(f.store.rows.get(run.id).invocation.error).toBeUndefined()
        await f.original().checkpoint({
            status: 'succeeded',
            handle: run.handle,
            result: { text: 'business done' },
            controlEvidence: {
                version: 1,
                source: 'provider',
                scope: 'operation',
                state: 'settled',
                subject: { kind: 'invocation', id: run.id },
                sessionId: run.handle.sessionId,
                runId: run.handle.runId,
                outcome: 'succeeded',
                target: run.executionTarget,
                receiptKey: 'exit',
                observedAt: new Date().toISOString()
            }
        })
        const final = await f.apiB.inspect(run.id)
        expect(final.status).toBe('succeeded')
        expect(final.error).toBeUndefined()
    })
    it('keeps the saved successful result when a competing unconfirmed failure arrives during cleanup', async () => {
        const f = fixture(),
            run = await f.apiA.start(f.request)
        await f.original().checkpoint({ status: 'succeeded', handle: run.handle, result: { text: 'saved report' } })
        const before = structuredClone(f.store.rows.get(run.id).invocation)
        await f.original().checkpoint({ status: 'failed', error: '[runner_unavailable] concurrent inspect' })
        expect(f.store.rows.get(run.id).invocation).toEqual(before)
    })
    it('does not let cleanup loss with an exit receipt overwrite a checkpointed result', async () => {
        const f = fixture(),
            run = await f.apiA.start(f.request)
        let entered: () => void, release: () => void
        const inspecting = new Promise<void>((resolve) => {
            entered = resolve
        })
        const cleanup = new Promise<void>((resolve) => {
            release = resolve
        })
        const evidence = (outcome: 'succeeded' | 'failed') => ({
            version: 1 as const,
            source: 'provider' as const,
            scope: 'operation' as const,
            state: 'settled' as const,
            subject: { kind: 'invocation' as const, id: run.id },
            sessionId: run.handle.sessionId,
            runId: run.handle.runId,
            outcome,
            target: run.executionTarget,
            receiptKey: 'same-process-exit',
            observedAt: new Date().toISOString()
        })
        f.a.inspect = jest.fn(async (_handle, context): Promise<AgentRuntimeObservation> => {
            if (context.settlement)
                return { ...context.settlement, handle: run.handle, controlEvidence: evidence('succeeded') }
            entered()
            await cleanup
            return {
                status: 'failed',
                handle: { ...run.handle, metadata: { completion: { code: 'activity_incomplete' } } },
                error: '[activity_incomplete] Source cleaned by concurrent inspection',
                controlEvidence: evidence('failed')
            }
        })
        const stale = f.apiA.inspect(run.id)
        await inspecting
        const handle = { ...run.handle, metadata: { completion: { code: 'completed' } } }
        const result = {
            text: 'saved report',
            export: { mode: 'files' as const, status: 'failed' as const, error: 'artifact_collection_failed' }
        }
        await f.original().checkpoint({ status: 'succeeded', handle, result })
        release()
        expect(await stale).toMatchObject({ status: 'unknown', reportedOutcome: 'succeeded', handle, result })
        // The next automatic inspection uses the durable outcome without launching another operation.
        expect(await f.apiA.inspect(run.id)).toMatchObject({ status: 'succeeded', result })
        expect(f.a.start).toHaveBeenCalledTimes(1)
    })
    it.each(['running', 'unknown'] as const)(
        'ignores unconfirmed %s progress after a successful checkpoint',
        async (status) => {
            const f = fixture(),
                run = await f.apiA.start(f.request)
            const handle = { ...run.handle, metadata: { completion: { code: 'completed' } } }
            await f.original().checkpoint({ status: 'succeeded', handle, result: { text: 'saved' } })
            const before = structuredClone(f.store.rows.get(run.id).invocation)
            await f.original().checkpoint({ status, handle: run.handle, error: 'late transport failure' })
            expect(f.store.rows.get(run.id).invocation).toEqual(before)
        }
    )
    it('recovers the durable result on a new host after cleanup interrupted inspection', async () => {
        const f = fixture(false),
            run = await f.apiA.start(f.request)
        const result = { text: 'saved report', export: { mode: 'none' as const, status: 'not_requested' as const } }
        await f.original().checkpoint({ status: 'succeeded', handle: run.handle, result })
        f.b.inspect = jest.fn(async (handle, context): Promise<AgentRuntimeObservation> => {
            expect(context.settlement).toEqual({ status: 'succeeded', result, error: undefined })
            return {
                ...context.settlement,
                status: 'succeeded',
                handle,
                controlEvidence: {
                    version: 1,
                    source: 'provider',
                    scope: 'operation',
                    state: 'settled',
                    subject: { kind: 'invocation', id: run.id },
                    sessionId: handle.sessionId,
                    runId: handle.runId,
                    outcome: 'succeeded',
                    target: context.executionTarget,
                    receiptKey: 'exit',
                    observedAt: new Date().toISOString()
                }
            }
        })
        expect(await f.apiB.inspect(run.id)).toMatchObject({ status: 'succeeded', result })
        expect(f.b.start).not.toHaveBeenCalled()
    })
    it.each(['failed', 'cancelled'] as const)(
        'accepts a fresh verified %s outcome after an unconfirmed successful result',
        async (status) => {
            const f = fixture(false),
                run = await f.apiA.start(f.request)
            const result = { text: 'saved result remains available as evidence' }
            await f.original().checkpoint({ status: 'succeeded', handle: run.handle, result })
            const handle = { ...run.handle, metadata: { receipt: 'fresh remote observation' } }
            const error = 'New authoritative operation outcome'
            f.b.inspect = jest.fn(async (_handle, context): Promise<AgentRuntimeObservation> => {
                expect(context.settlement?.status).toBe('succeeded')
                return {
                    status,
                    handle,
                    error,
                    controlEvidence: {
                        version: 1,
                        source: 'provider',
                        scope: 'operation',
                        state: 'settled',
                        subject: { kind: 'invocation', id: run.id },
                        sessionId: handle.sessionId,
                        runId: handle.runId,
                        outcome: status,
                        target: context.executionTarget,
                        receiptKey: 'fresh-remote-outcome',
                        observedAt: new Date().toISOString()
                    }
                }
            })
            expect(await f.apiB.inspect(run.id)).toMatchObject({
                status,
                reportedOutcome: status,
                handle,
                result,
                error
            })
            expect(f.b.start).not.toHaveBeenCalled()
        }
    )
    it('keeps durable result content while accepting fresh completion metadata and diagnostics', async () => {
        const f = fixture(false),
            run = await f.apiA.start(f.request)
        const result = {
            text: 'saved report',
            report: { status: 'completed' as const, path: 'report.md', sha256: 'digest' }
        }
        await f.original().checkpoint({ status: 'succeeded', handle: run.handle, result })
        const handle = { ...run.handle, metadata: { receipt: 'final-receipt' } }
        f.b.inspect = jest.fn(
            async (_handle, context): Promise<AgentRuntimeObservation> => ({
                status: 'succeeded',
                handle,
                error: 'Non-fatal completion diagnostic',
                result: { text: '', report: { status: 'failed', path: 'report.md', code: 'report_unavailable' } },
                controlEvidence: {
                    version: 1,
                    source: 'provider',
                    scope: 'operation',
                    state: 'settled',
                    subject: { kind: 'invocation', id: run.id },
                    sessionId: handle.sessionId,
                    runId: handle.runId,
                    outcome: 'succeeded',
                    target: context.executionTarget,
                    receiptKey: 'fresh-exit',
                    observedAt: new Date().toISOString()
                }
            })
        )
        expect(await f.apiB.inspect(run.id)).toMatchObject({
            status: 'succeeded',
            handle,
            result,
            error: 'Non-fatal completion diagnostic'
        })
    })
    it.each([false, true])('validates observation identity even after success (concurrent=%s)', async (concurrent) => {
        const f = fixture(false),
            run = await f.apiA.start(f.request)
        let entered: () => void, release: () => void
        const inspecting = new Promise<void>((resolve) => {
            entered = resolve
        })
        const barrier = new Promise<void>((resolve) => {
            release = resolve
        })
        f.a.inspect = jest.fn(async (): Promise<AgentRuntimeObservation> => {
            entered()
            await barrier
            return { status: 'failed', handle: { ...run.handle, runId: 'another-operation' } }
        })
        if (!concurrent) await f.original().checkpoint({ status: 'succeeded', result: { text: 'saved' } })
        const pending = f.apiA.inspect(run.id)
        await inspecting
        if (concurrent) await f.original().checkpoint({ status: 'succeeded', result: { text: 'saved' } })
        const rejection = expect(pending).rejects.toMatchObject({ code: 'InvalidRequest' })
        release()
        await rejection
    })
    it('lets an explicit host cancellation settle after a saved successful result', async () => {
        const f = fixture(),
            run = await f.apiA.start(f.request)
        await f.original().checkpoint({ status: 'succeeded', result: { text: 'saved' } })
        f.stop()
        expect(await f.apiA.cancel(run.id)).toMatchObject({
            status: 'cancelled',
            control: { intent: 'terminated' },
            reportedOutcome: 'cancelled'
        })
        expect(f.a.cancel).toHaveBeenCalledTimes(1)
    })
    it('uses matching stale completion proof without replacing newer result metadata or diagnostics', async () => {
        const f = fixture(false),
            run = await f.apiA.start(f.request)
        let entered: () => void, release: () => void
        const inspecting = new Promise<void>((resolve) => {
            entered = resolve
        })
        const barrier = new Promise<void>((resolve) => {
            release = resolve
        })
        f.a.inspect = jest.fn(async (_handle, context): Promise<AgentRuntimeObservation> => {
            entered()
            await barrier
            return {
                status: 'succeeded',
                handle: run.handle,
                result: { text: 'old observation' },
                controlEvidence: {
                    version: 1,
                    source: 'provider',
                    scope: 'operation',
                    state: 'settled',
                    subject: { kind: 'invocation', id: run.id },
                    sessionId: run.handle.sessionId,
                    runId: run.handle.runId,
                    outcome: 'succeeded',
                    target: context.executionTarget,
                    receiptKey: 'same-outcome-proof',
                    observedAt: new Date().toISOString()
                }
            }
        })
        const pending = f.apiA.inspect(run.id)
        await inspecting
        const handle = { ...run.handle, metadata: { receipt: 'newer' } },
            result = { text: 'durable result' }
        await f.original().checkpoint({ status: 'succeeded', handle, result, error: 'saved diagnostic' })
        release()
        expect(await pending).toMatchObject({ status: 'succeeded', handle, result, error: 'saved diagnostic' })
    })
    it('rechecks observation freshness when a concurrent write wins the result CAS', async () => {
        const f = fixture(false),
            run = await f.apiA.start(f.request)
        const result = { text: 'saved result' }
        await f.original().checkpoint({ status: 'succeeded', result })
        f.b.inspect = jest.fn(
            async (_handle, context): Promise<AgentRuntimeObservation> => ({
                status: 'failed',
                handle: run.handle,
                error: 'superseded diagnosis',
                controlEvidence: {
                    version: 1,
                    source: 'provider',
                    scope: 'operation',
                    state: 'settled',
                    subject: { kind: 'invocation', id: run.id },
                    sessionId: run.handle.sessionId,
                    runId: run.handle.runId,
                    outcome: 'failed',
                    target: context.executionTarget,
                    receiptKey: 'exit',
                    observedAt: new Date().toISOString()
                }
            })
        )
        const replace = f.store.replace.bind(f.store)
        const handle = { ...run.handle, metadata: { receipt: 'concurrent update' } }
        jest.spyOn(f.store, 'replace').mockImplementationOnce(async (record, revision) => {
            await f.original().checkpoint({ status: 'succeeded', handle, result })
            return replace(record, revision)
        })
        expect(await f.apiB.inspect(run.id)).toMatchObject({
            status: 'unknown',
            reportedOutcome: 'succeeded',
            handle,
            result
        })
        expect(f.store.rows.get(run.id).invocation.error).toBeUndefined()
    })
    it('keeps the saved report when a concurrent successful inspection loses delivery files', async () => {
        const f = fixture(),
            run = await f.apiA.start(f.request)
        const result = {
            text: 'saved report',
            report: { status: 'completed' as const, path: 'report.md', sha256: 'digest' }
        }
        await f.original().checkpoint({ status: 'succeeded', handle: run.handle, result })
        await f.original().checkpoint({
            status: 'succeeded',
            result: {
                text: '',
                report: { status: 'failed', path: 'report.md', code: 'report_unavailable' }
            }
        })
        expect(f.store.rows.get(run.id).invocation.result).toEqual(result)
    })
    it('replaces a provisional failure only with a verified terminal result from the same execution target', async () => {
        const f = fixture(),
            run = await f.apiA.start(f.request)
        await f
            .original()
            .checkpoint({ status: 'failed', error: '[activity_incomplete] Earlier inspection incomplete' })
        await f.original().checkpoint({ status: 'succeeded', result: { text: 'unconfirmed' } })
        expect(f.store.rows.get(run.id).invocation.reportedOutcome).toBe('failed')
        expect(f.store.rows.get(run.id).invocation.result).toBeUndefined()
        await f.original().checkpoint({
            status: 'succeeded',
            handle: run.handle,
            result: { text: 'verified report' },
            controlEvidence: {
                version: 1,
                source: 'provider',
                scope: 'operation',
                state: 'settled',
                subject: { kind: 'invocation', id: run.id },
                sessionId: run.handle.sessionId,
                runId: run.handle.runId,
                outcome: 'succeeded',
                target: run.executionTarget,
                receiptKey: 'exit',
                observedAt: new Date().toISOString()
            }
        })
        const final = await f.apiB.inspect(run.id)
        expect(final).toMatchObject({
            status: 'succeeded',
            reportedOutcome: 'succeeded',
            result: { text: 'verified report' }
        })
        expect(final.error).toBeUndefined()
    })
    it('routes an approval once to the original host and lets termination supersede queued approval', async () => {
        const f = fixture(),
            run = await f.apiA.start(f.request)
        await f
            .original()
            .checkpoint({ status: 'waiting', interaction: { id: 'approval', kind: 'approval', prompt: 'Approve?' } })
        await f.apiB.respond(run.id, 'approval', true)
        await Promise.all([f.runtimeA.reconcileOwned(), f.runtimeA.reconcileOwned()])
        expect(f.a.respond).toHaveBeenCalledTimes(1)
        expect(f.b.respond).not.toHaveBeenCalled()
        await f.runtimeA.reconcileOwned()
        expect(f.a.respond).toHaveBeenCalledTimes(1)
    })
})

describe('original-host admission races', () => {
    it('keeps cancellation while the original host has not returned a handle', async () => {
        const f = fixture(),
            originalStart = f.a.start.bind(f.a)
        let release: () => void
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        f.a.start = jest.fn(async (request, context) => {
            const observation = await originalStart(request, context)
            await gate
            return observation
        })
        const pending = f.apiA.start(f.request)
        for (let n = 0; n < 100 && !f.original(); n++) await new Promise((resolve) => setTimeout(resolve, 1))
        const id = f.original().invocationId
        expect(f.store.rows.get(id).invocation.handle).toBeUndefined()
        await f.apiB.cancel(id)
        release()
        expect((await pending).status).toBe('cancelling')
        expect(f.a.start).toHaveBeenCalledTimes(1)
        expect(f.b.cancel).not.toHaveBeenCalled()
        f.stop()
        await f.runtimeA.reconcileOwned()
        expect((await f.apiB.start(f.request)).status).toBe('cancelled')
        expect(f.a.start).toHaveBeenCalledTimes(1)
    })
    it('termination supersedes an undelivered approval and never starts its requested tool', async () => {
        const f = fixture(),
            run = await f.apiA.start(f.request)
        await f
            .original()
            .checkpoint({ status: 'waiting', interaction: { id: 'approval', kind: 'approval', prompt: 'Approve?' } })
        await f.apiB.respond(run.id, 'approval', true)
        await f.apiB.cancel(run.id)
        await f.runtimeA.reconcileOwned()
        expect(f.a.respond).not.toHaveBeenCalled()
        expect(f.a.cancel).toHaveBeenCalledTimes(1)
    })
    it('only delivers persisted termination after access has been revoked', async () => {
        const f = fixture(),
            run = await f.apiA.start(f.request)
        await f.apiB.cancel(run.id)
        const authorize = jest.fn().mockRejectedValue(new Error('access revoked'))
        await f.runtimeA.reconcileOwned(authorize)
        expect(authorize).not.toHaveBeenCalled()
        expect(f.a.cancel).toHaveBeenCalledTimes(1)
    })
})
