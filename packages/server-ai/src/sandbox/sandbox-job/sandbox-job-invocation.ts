// Invariants: stdout is untrusted; only this attempt's declared operations can run.
// Host callbacks retain their initiating context. Scripts receive no transferable credentials.
import { AsyncResource } from 'node:async_hooks'
import { z } from 'zod/v3'
import type { JSONValue } from '@xpert-ai/contracts'
import {
    SANDBOX_JOB_INVOCATION_PREFIX,
    type SandboxJobRunOptions,
    type SandboxRuntimeInstance,
    type SandboxRuntimeOutputChunk
} from '@xpert-ai/plugin-sdk'

const json: z.ZodType<JSONValue> = z.lazy(() =>
    z.union([
        z.string().max(64000),
        z.number().finite(),
        z.boolean(),
        z.null(),
        z.array(json).max(1000),
        z.record(json)
    ])
)
const requestSchema = z
    .object({
        id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
        operation: z.string().min(1).max(100),
        payload: json
    })
    .strict()

export class SandboxJobInvocationSession {
    private buffer = ''
    private discardLine = false
    private readonly ids = new Set<string>()
    private readonly controller = new AbortController()
    private bytes = 0
    private accepted = 0
    private pending = Promise.resolve()
    private failure?: Error
    private closed = false
    private readonly invoke: (line: string) => Promise<void>
    private readonly maxCalls: number
    private readonly maxBytes: number
    private readonly abort = () => this.close()

    constructor(
        jobId: string,
        private readonly runtime: SandboxRuntimeInstance,
        private readonly options: SandboxJobRunOptions
    ) {
        const bridge = options.invocation
        if (
            !bridge ||
            !Number.isSafeInteger(bridge.maxCalls) ||
            bridge.maxCalls <= 0 ||
            !Number.isSafeInteger(bridge.maxBytes) ||
            bridge.maxBytes <= 0
        ) {
            throw new Error('SANDBOX_INVOCATION_CONFIG_INVALID')
        }
        this.maxCalls = Math.min(bridge.maxCalls, 32)
        this.maxBytes = Math.min(bridge.maxBytes, 8_000_000)
        const operations = new Set(bridge.operations)
        // Provider stream callbacks may originate outside the request's AsyncLocalStorage.
        this.invoke = AsyncResource.bind(async (line: string) => {
            this.controller.signal.throwIfAborted()
            const request = requestSchema.parse(JSON.parse(line))
            if (this.ids.has(request.id) || !operations.has(request.operation))
                throw new Error('SANDBOX_INVOCATION_DENIED')
            this.ids.add(request.id)
            const value = await this.untilClosed(() =>
                bridge.handle(request.operation, request.payload, {
                    jobId,
                    signal: this.controller.signal
                })
            )
            this.controller.signal.throwIfAborted()
            const content = Buffer.from(JSON.stringify({ id: request.id, value }))
            this.reserveBytes(content.length)
            const [written] = await this.untilClosed(() =>
                runtime.uploadFiles([[`${runtime.workspaceRoot}/invocations/${request.id}.json`, content]])
            )
            if (!written || written.error) throw new Error('SANDBOX_INVOCATION_WRITE_FAILED')
        })
        options.signal?.addEventListener('abort', this.abort, { once: true })
        if (options.signal?.aborted) this.abort()
    }

    get error(): Error | undefined {
        return this.failure
    }

    push(chunk: SandboxRuntimeOutputChunk): void {
        if (this.closed || this.failure || chunk.stream !== 'stdout') return
        const parts = chunk.text.split('\n')
        for (let index = 0; index < parts.length; index++) {
            if (this.closed) return
            if (!this.discardLine) {
                const line = this.buffer + parts[index]
                if (line.startsWith(SANDBOX_JOB_INVOCATION_PREFIX) || SANDBOX_JOB_INVOCATION_PREFIX.startsWith(line)) {
                    if (Buffer.byteLength(line) > 128_000) {
                        this.fail(new Error('SANDBOX_INVOCATION_LIMIT'))
                        return
                    }
                    this.buffer = line
                } else {
                    // Ordinary logs, including long or split lines, consume no bridge buffers or quotas.
                    this.buffer = ''
                    this.discardLine = true
                }
            }
            if (index < parts.length - 1) {
                this.enqueue()
                this.buffer = ''
                this.discardLine = false
            }
        }
    }

    async finish(): Promise<void> {
        if (!this.closed) this.enqueue()
        this.buffer = ''
        this.closed = true
        await this.pending
        if (this.failure) throw this.failure
        this.controller.signal.throwIfAborted()
    }

    close(): void {
        this.closed = true
        this.controller.abort()
        this.options.signal?.removeEventListener('abort', this.abort)
    }

    private enqueue(): void {
        if (this.closed || !this.buffer.startsWith(SANDBOX_JOB_INVOCATION_PREFIX)) return
        try {
            if (++this.accepted > this.maxCalls) throw new Error('SANDBOX_INVOCATION_LIMIT')
            this.reserveBytes(Buffer.byteLength(this.buffer))
            const line = this.buffer.slice(SANDBOX_JOB_INVOCATION_PREFIX.length)
            this.pending = this.pending
                .then(() => this.invoke(line))
                .catch((error: unknown) => {
                    this.fail(error instanceof Error ? error : new Error('SANDBOX_INVOCATION_FAILED'))
                })
        } catch (error: unknown) {
            this.fail(error instanceof Error ? error : new Error('SANDBOX_INVOCATION_FAILED'))
        }
    }

    private reserveBytes(bytes: number): void {
        this.bytes += bytes
        if (this.bytes > this.maxBytes) throw new Error('SANDBOX_INVOCATION_LIMIT')
    }

    /** Stop awaiting a callback after cancellation; never publish its late result. */
    private async untilClosed<T>(work: () => Promise<T>): Promise<T> {
        const signal = this.controller.signal
        signal.throwIfAborted()
        let abort: () => void = () => undefined
        const cancelled = new Promise<never>((_resolve, reject) => {
            abort = () => reject(new Error('SANDBOX_INVOCATION_CANCELLED'))
            signal.addEventListener('abort', abort, { once: true })
        })
        try {
            return await Promise.race([work(), cancelled])
        } finally {
            signal.removeEventListener('abort', abort)
        }
    }

    private fail(error: Error): void {
        if (this.failure) return
        this.failure = error
        this.close()
        // Provider cleanup still runs in the lifecycle service if termination fails.
        void Promise.resolve()
            .then(() => this.runtime.terminate?.())
            .catch(() => undefined)
    }
}
