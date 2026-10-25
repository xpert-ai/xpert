import { AsyncLocalStorage } from 'node:async_hooks'
import { SandboxJobInvocationSession } from './sandbox-job-invocation'
import type { SandboxRuntimeInstance } from '@xpert-ai/plugin-sdk'

function fixture(handle = jest.fn().mockResolvedValue({ rows: [] })) {
    const runtime: SandboxRuntimeInstance = {
        id: 'runtime',
        workspaceRoot: '/workspace',
        execute: jest.fn(),
        uploadFiles: jest.fn().mockResolvedValue([{ path: 'response', error: null }]),
        downloadFiles: jest.fn(),
        terminate: jest.fn()
    }
    const abort = new AbortController()
    return {
        runtime,
        abort,
        handle,
        options: { signal: abort.signal, invocation: { operations: ['read'], maxCalls: 2, maxBytes: 200, handle } }
    }
}
const line = (id: string, operation = 'read') =>
    `XPERT_SANDBOX_INVOKE ${JSON.stringify({ id, operation, payload: {} })}\n`
describe('job-scoped invocation bridge', () => {
    it('restores actor context across external stream callbacks and accepts split lines', async () => {
        const f = fixture(),
            storage = new AsyncLocalStorage<string>()
        f.handle.mockImplementation(async () => ({ actor: storage.getStore() }))
        const bridge = storage.run('actor-1', () => new SandboxJobInvocationSession('job-1', f.runtime, f.options))
        const text = line('one')
        bridge.push({ stream: 'stdout', text: text.slice(0, 19) })
        bridge.push({ stream: 'stdout', text: text.slice(19) })
        await bridge.finish()
        bridge.close()
        const bytes = jest.mocked(f.runtime.uploadFiles).mock.calls[0][0][0][1]
        expect(JSON.parse(Buffer.from(bytes).toString()).value.actor).toBe('actor-1')
    })
    it.each(['../escape', 'one'])(
        'rejects replay/path traversal before executing extra operations (%s)',
        async (id) => {
            const f = fixture(),
                bridge = new SandboxJobInvocationSession('job', f.runtime, f.options)
            bridge.push({ stream: 'stdout', text: line(id) + line(id) })
            await expect(bridge.finish()).rejects.toBeDefined()
            expect(f.handle.mock.calls.length).toBeLessThanOrEqual(1)
            expect(f.runtime.terminate).toHaveBeenCalled()
        }
    )
    it('denies undeclared operations and stops accepting callbacks after cancellation', async () => {
        const f = fixture(),
            bridge = new SandboxJobInvocationSession('job', f.runtime, f.options)
        bridge.push({ stream: 'stdout', text: line('one', 'admin') })
        await expect(bridge.finish()).rejects.toThrow('DENIED')
        bridge.push({ stream: 'stdout', text: line('two') })
        expect(f.handle).not.toHaveBeenCalled()
    })
    it('propagates cancellation to an in-flight child query', async () => {
        const f = fixture(),
            bridge = new SandboxJobInvocationSession('job', f.runtime, f.options)
        f.handle.mockImplementation(
            (_operation, _payload, { signal }) =>
                new Promise((_resolve, reject) =>
                    signal.addEventListener('abort', () => reject(new Error('cancelled')))
                )
        )
        bridge.push({ stream: 'stdout', text: line('one') })
        await new Promise((resolve) => setImmediate(resolve))
        f.abort.abort()
        await expect(bridge.finish()).rejects.toThrow(/CANCELLED|cancelled/)
    })
})

describe('invocation limits and lifecycle', () => {
    it('ignores ordinary logs and stderr across chunk boundaries without consuming the request budget', async () => {
        const f = fixture()
        const bridge = new SandboxJobInvocationSession('job', f.runtime, f.options)
        bridge.push({ stream: 'stderr', text: line('ignored') })
        bridge.push({ stream: 'stdout', text: 'regular log: ' + 'x'.repeat(160_000) })
        bridge.push({ stream: 'stdout', text: line('embedded') })
        bridge.push({ stream: 'stdout', text: 'log\n'.repeat(40_000) + line('one').trimEnd() })
        await bridge.finish()
        bridge.close()
        expect(f.handle).toHaveBeenCalledTimes(1)
        expect(f.runtime.uploadFiles).toHaveBeenCalledWith([['/workspace/invocations/one.json', expect.any(Buffer)]])
    })

    it('checks the request byte budget before invoking host code', async () => {
        const f = fixture()
        f.options.invocation.maxBytes = 1
        const bridge = new SandboxJobInvocationSession('job', f.runtime, f.options)
        bridge.push({ stream: 'stdout', text: line('one') })
        await expect(bridge.finish()).rejects.toThrow('LIMIT')
        expect(f.handle).not.toHaveBeenCalled()
    })

    it('counts UTF-8 response bytes against the same budget and rejects before publication', async () => {
        const f = fixture(jest.fn().mockResolvedValue({ text: '数'.repeat(50) }))
        const bridge = new SandboxJobInvocationSession('job', f.runtime, f.options)
        bridge.push({ stream: 'stdout', text: line('one') })
        await expect(bridge.finish()).rejects.toThrow('LIMIT')
        expect(f.handle).toHaveBeenCalledTimes(1)
        expect(f.runtime.uploadFiles).not.toHaveBeenCalled()
    })

    it('bounds queued requests and frame length independently of normal logs', async () => {
        const f = fixture()
        const bridge = new SandboxJobInvocationSession('job', f.runtime, f.options)
        bridge.push({ stream: 'stdout', text: line('one') + line('two') + line('three') })
        await expect(bridge.finish()).rejects.toThrow('LIMIT')
        expect(f.handle.mock.calls.length).toBeLessThanOrEqual(2)
        const other = fixture()
        const oversized = new SandboxJobInvocationSession('job', other.runtime, other.options)
        oversized.push({ stream: 'stdout', text: 'XPERT_SANDBOX_INVOKE ' + 'x'.repeat(128_000) })
        await expect(oversized.finish()).rejects.toThrow('LIMIT')
        expect(other.handle).not.toHaveBeenCalled()
    })

    it.each([NaN, Infinity, 0, -1, 1.5])('rejects invalid host limits (%s)', (value) => {
        const f = fixture()
        expect(
            () =>
                new SandboxJobInvocationSession('job', f.runtime, {
                    invocation: { ...f.options.invocation, maxCalls: value }
                })
        ).toThrow('CONFIG_INVALID')
        expect(
            () =>
                new SandboxJobInvocationSession('job', f.runtime, {
                    invocation: { ...f.options.invocation, maxBytes: value }
                })
        ).toThrow('CONFIG_INVALID')
    })

    it.each(['not-json', '{"id":"one","operation":"read","payload":{},"extra":true}'])(
        'rejects malformed frames before host code',
        async (request) => {
            const f = fixture()
            const bridge = new SandboxJobInvocationSession('job', f.runtime, f.options)
            bridge.push({ stream: 'stdout', text: 'XPERT_SANDBOX_INVOKE ' + request + '\n' })
            await expect(bridge.finish()).rejects.toBeDefined()
            expect(f.handle).not.toHaveBeenCalled()
        }
    )

    it('stops waiting for a handler that ignores cancellation and discards its late result', async () => {
        const f = fixture()
        let resolve: (value: { rows: never[] }) => void = () => undefined
        f.handle.mockImplementation(
            () =>
                new Promise((done) => {
                    resolve = done
                })
        )
        const bridge = new SandboxJobInvocationSession('job', f.runtime, f.options)
        bridge.push({ stream: 'stdout', text: line('one') })
        await new Promise((done) => setImmediate(done))
        f.abort.abort()
        await expect(bridge.finish()).rejects.toThrow('CANCELLED')
        let drained = false
        const drain = bridge.drain().then(() => {
            drained = true
        })
        await new Promise((done) => setImmediate(done))
        expect(drained).toBe(false)
        resolve({ rows: [] })
        await drain
        expect(drained).toBe(true)
        await new Promise((done) => setImmediate(done))
        expect(f.runtime.uploadFiles).not.toHaveBeenCalled()
        bridge.push({ stream: 'stdout', text: line('two') })
        expect(f.handle).toHaveBeenCalledTimes(1)
    })

    it('reports a missing response receipt and contains provider termination failures', async () => {
        const f = fixture()
        jest.mocked(f.runtime.uploadFiles).mockResolvedValue([])
        jest.mocked(f.runtime.terminate).mockRejectedValue(new Error('provider unavailable'))
        const bridge = new SandboxJobInvocationSession('job', f.runtime, f.options)
        bridge.push({ stream: 'stdout', text: line('one') })
        await expect(bridge.finish()).rejects.toThrow('WRITE_FAILED')
        await new Promise((done) => setImmediate(done))
        expect(f.runtime.terminate).toHaveBeenCalledTimes(1)
    })
})
