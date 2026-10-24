// Invariants: this client speaks only the fixed Jobs protocol, never interactive exec.
// Deadlines cover the response body as well as headers; Runner diagnostics never become public errors.
import type {
    SandboxRuntimeDefinition,
    SandboxRuntimeExecuteResponse,
    SandboxRuntimeExecutionOptions,
    SandboxRuntimeFileDownloadResponse,
    SandboxRuntimeFileUploadResponse
} from '@xpert-ai/plugin-sdk'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod/v3'
import type { NsjailRunnerConfig } from '../nsjail.types'
import {
    computeUnavailable,
    downloadResultSchema,
    healthSchema,
    streamEventSchema,
    uploadResultSchema
} from './compute-contract'

const MAX_RESPONSE_BYTES = 64 * 1024 * 1024
export type NsjailJobClientOptions = {
    root: string
    healthTimeoutMs: number
    unavailable: typeof computeUnavailable
}
const DEFAULT_OPTIONS: NsjailJobClientOptions = {
    root: '/v1/compute',
    healthTimeoutMs: 15_000,
    unavailable: computeUnavailable
}

export class NsjailComputeClient {
    constructor(
        private readonly config: NsjailRunnerConfig,
        private readonly options = DEFAULT_OPTIONS
    ) {}

    async health(definition: SandboxRuntimeDefinition): Promise<Record<string, string>> {
        const health = healthSchema.parse(
            await this.json(`${this.options.root}/health`, 'GET', undefined, this.options.healthTimeoutMs)
        )
        if (
            !health.available ||
            !health.manifest ||
            !isDeepStrictEqual(health.definition, definition) ||
            Object.entries(definition.expectedManifest).some(([key, value]) => health.manifest[key] !== value)
        )
            throw this.options.unavailable()
        return health.manifest
    }

    async create(id: string, definition: SandboxRuntimeDefinition): Promise<void> {
        const result = z.object({ runtimeId: z.literal(id) }).strict()
        result.parse(
            await this.json(
                `${this.options.root}/jobs`,
                'POST',
                { runtimeId: id, definition },
                this.options.healthTimeoutMs + 5000
            )
        )
    }

    async destroy(id: string): Promise<void> {
        await this.json(`${this.options.root}/jobs/${id}`, 'DELETE', undefined, 10_000)
    }

    async terminate(id: string): Promise<void> {
        await this.json(`${this.options.root}/jobs/${id}/terminate`, 'POST', {}, 10_000, true)
    }

    async upload(id: string, files: Array<[string, Uint8Array]>): Promise<SandboxRuntimeFileUploadResponse[]> {
        const results: SandboxRuntimeFileUploadResponse[] = []
        // Bound each JSON body even when Core materializes a complete Action in one call.
        for (const [path, content] of files) {
            if (content.byteLength > 32 * 1024 * 1024) {
                results.push({ path, error: 'permission_denied' })
                continue
            }
            const result = uploadResultSchema.parse(
                await this.json(`${this.options.root}/jobs/${id}/files/upload`, 'POST', {
                    files: [{ path, contentBase64: Buffer.from(content).toString('base64') }]
                })
            )
            if (result.length !== 1 || result[0].path !== path) throw this.options.unavailable()
            results.push({ path: result[0].path, error: result[0].error })
        }
        return results
    }

    async download(id: string, paths: string[]): Promise<SandboxRuntimeFileDownloadResponse[]> {
        const results = downloadResultSchema.parse(
            await this.json(`${this.options.root}/jobs/${id}/files/download`, 'POST', { paths })
        )
        if (results.length !== paths.length || results.some((result, index) => result.path !== paths[index]))
            throw this.options.unavailable()
        let bytes = 0
        return results.map(({ path, error, contentBase64 }) => {
            if ((error === null) !== (contentBase64 !== null)) throw this.options.unavailable()
            const content = contentBase64 === null ? null : Buffer.from(contentBase64, 'base64')
            bytes += content?.byteLength ?? 0
            if (bytes > 32 * 1024 * 1024) throw this.options.unavailable()
            return { path, error, content }
        })
    }

    async execute(
        id: string,
        timeoutMs: number,
        maxOutputBytes: number,
        onOutput: SandboxRuntimeExecutionOptions['onOutput']
    ): Promise<SandboxRuntimeExecuteResponse> {
        try {
            const response = await this.request(
                `${this.options.root}/jobs/${id}/execute`,
                'POST',
                { timeoutMs, maxOutputBytes },
                timeoutMs + 5000
            )
            if (!response.body) throw this.options.unavailable()
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffered = ''
            let received = 0
            let streamed = 0
            let result: SandboxRuntimeExecuteResponse | undefined
            const consume = (line: string) => {
                if (!line) return
                if (result) throw this.options.unavailable()
                const event = streamEventSchema.parse(JSON.parse(line))
                if (event.type === 'result') {
                    if (Buffer.byteLength(event.result.output) > maxOutputBytes + 3) throw this.options.unavailable()
                    result = {
                        output: event.result.output,
                        exitCode: event.result.exitCode,
                        truncated: event.result.truncated,
                        timedOut: event.result.timedOut,
                        ...(event.result.terminationReason ? { terminationReason: event.result.terminationReason } : {})
                    }
                } else {
                    streamed += Buffer.byteLength(event.text)
                    if (streamed > maxOutputBytes + 3) throw this.options.unavailable()
                    try {
                        onOutput?.({ stream: 'stdout', text: event.text })
                    } catch {
                        /* observers are best-effort */
                    }
                }
            }
            try {
                while (true) {
                    const chunk = await reader.read()
                    if (chunk.done) break
                    received += chunk.value.byteLength
                    if (received > MAX_RESPONSE_BYTES) throw this.options.unavailable()
                    buffered += decoder.decode(chunk.value, { stream: true })
                    let newline = buffered.indexOf('\n')
                    while (newline >= 0) {
                        consume(buffered.slice(0, newline))
                        buffered = buffered.slice(newline + 1)
                        newline = buffered.indexOf('\n')
                    }
                }
                buffered += decoder.decode()
                if (buffered.trim()) consume(buffered)
                if (!result) throw this.options.unavailable()
                return result
            } finally {
                await reader.cancel().catch(() => undefined)
            }
        } catch {
            await this.terminate(id).catch(() => undefined)
            throw this.options.unavailable()
        }
    }

    private async json(
        route: string,
        method: string,
        body?: unknown,
        timeoutMs = 10_000,
        allowMissing = false
    ): Promise<unknown> {
        const response = await this.request(route, method, body, timeoutMs, allowMissing)
        if (allowMissing && response.status === 404) return null
        if (!response.body) throw this.options.unavailable()
        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let bytes = 0
        try {
            while (true) {
                const chunk = await reader.read()
                if (chunk.done) break
                bytes += chunk.value.byteLength
                if (bytes > MAX_RESPONSE_BYTES) throw this.options.unavailable()
                chunks.push(chunk.value)
            }
            return JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
            throw this.options.unavailable()
        } finally {
            await reader.cancel().catch(() => undefined)
        }
    }

    private async request(
        route: string,
        method: string,
        body: unknown,
        timeoutMs: number,
        allowMissing = false
    ): Promise<Response> {
        let response: Response
        try {
            response = await fetch(`${this.config.baseUrl}${route}`, {
                method,
                headers: { authorization: `Bearer ${this.config.token}`, 'content-type': 'application/json' },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                signal: AbortSignal.timeout(timeoutMs),
                redirect: 'error'
            })
        } catch {
            throw this.options.unavailable()
        }
        if (!response.ok && !(allowMissing && response.status === 404)) {
            await response.body?.cancel().catch(() => undefined)
            throw this.options.unavailable(response.status === 429)
        }
        return response
    }
}
