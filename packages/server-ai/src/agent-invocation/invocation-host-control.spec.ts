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

function fixture() {
    const store = new MemoryInvocationStore()
    const registryA = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
    const registryB = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
    let original: AgentRuntimeContext,
        stopped = false
    const handle = { sessionId: 'session', runId: 'turn' }
    const a: IAgentRuntimeStrategy = {
        capabilities: {
            hostAffinity: 1,
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
        await f.original().checkpoint({ status: 'succeeded', handle: run.handle, result: { text: 'business done' } })
        expect(f.store.rows.get(run.id).invocation).toMatchObject({
            status: 'unknown',
            result: { text: 'business done' }
        })
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
        expect((await f.apiB.inspect(run.id)).status).toBe('succeeded')
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
