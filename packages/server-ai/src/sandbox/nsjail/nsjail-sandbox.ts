import type { IncomingHttpHeaders } from 'node:http'
import {
    BaseSandbox,
    ExecuteResponse,
    FileDownloadResponse,
    FileUploadResponse,
    SandboxExecutionOptions,
    SandboxManagedServiceAdapter,
    SandboxManagedServiceListOptions,
    SandboxManagedServiceListResult,
    SandboxManagedServiceLogsOptions,
    SandboxManagedServiceRestartOptions,
    SandboxManagedServiceStartOptions,
    SandboxManagedServiceStartResult,
    SandboxManagedServiceStateChange,
    SandboxManagedServiceStopOptions,
    SandboxServiceProxyAdapter,
    SandboxServiceProxyRequest,
    SandboxTerminalAdapter,
    SandboxTerminalOpenOptions,
    SandboxTerminalSession
} from '@xpert-ai/plugin-sdk'
import type { ISandboxManagedService, TSandboxManagedServiceLogs } from '@xpert-ai/contracts'
import {
    isNsjailRuntimeNotFoundError,
    isPermanentNsjailRunnerRequestError,
    isRetryableNsjailRunnerRequestError,
    NsjailRunnerClient
} from './nsjail-runner.client'
import { getNsjailMessage } from './nsjail-i18n'
import { NsjailRuntimeCreateRequest, NsjailServiceStartRequest, NsjailServiceState } from './nsjail.types'

const TERMINAL_POLL_RETRY_MS = 100
const TERMINAL_POLL_MAX_RETRY_MS = 5_000
const MAX_PROXY_REQUEST_BYTES = 16 * 1024 * 1024

function sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function clampTerminalSize(value: number, fallback: number): number {
    return Number.isFinite(value) && value > 0 ? Math.max(1, Math.trunc(value)) : fallback
}

function toDate(value: string | null): Date | null {
    if (!value) {
        return null
    }
    const date = new Date(value)
    return Number.isNaN(date.valueOf()) ? null : date
}

function toRuntimeRef(runtimeId: string, serviceId: string) {
    return { runtimeId, serviceId }
}

function toServiceStateChange(runtimeId: string, state: NsjailServiceState): SandboxManagedServiceStateChange {
    return {
        actualPort: state.actualPort,
        exitCode: state.exitCode,
        runtimeRef: toRuntimeRef(runtimeId, state.serviceId),
        signal: state.signal,
        startedAt: toDate(state.startedAt) ?? undefined,
        status: state.status,
        stoppedAt: toDate(state.stoppedAt),
        transportMode: state.transportMode
    }
}

function normalizeHeaderValue(value: number | string | string[] | undefined): string {
    return Array.isArray(value) ? value.join(', ') : (value?.toString() ?? '')
}

function normalizeRequestHeaders(headers: IncomingHttpHeaders): { [name: string]: string } {
    const normalized: { [name: string]: string } = {}
    for (const [name, value] of Object.entries(headers)) {
        const lowerName = name.toLowerCase()
        if (
            value === undefined ||
            lowerName === 'connection' ||
            lowerName === 'keep-alive' ||
            lowerName === 'proxy-authenticate' ||
            lowerName === 'proxy-authorization' ||
            lowerName === 'te' ||
            lowerName === 'trailer' ||
            lowerName === 'transfer-encoding' ||
            lowerName === 'upgrade' ||
            lowerName === 'accept-encoding' ||
            lowerName === 'host'
        ) {
            continue
        }
        normalized[lowerName] = normalizeHeaderValue(value)
    }
    return normalized
}

function shouldRewritePreviewResponse(headers: Headers, method: string | undefined): boolean {
    if (method === 'HEAD' || headers.get('content-encoding')?.trim()) {
        return false
    }
    const contentType = headers.get('content-type')?.toLowerCase() ?? ''
    return (
        contentType.includes('text/html') ||
        contentType.includes('application/xhtml+xml') ||
        contentType.includes('text/css') ||
        contentType.includes('javascript') ||
        contentType.includes('ecmascript')
    )
}

function shouldForwardProxyResponseHeader(name: string, rewriteBody: boolean): boolean {
    const normalized = name.toLowerCase()
    if (
        normalized === 'connection' ||
        normalized === 'keep-alive' ||
        normalized === 'proxy-authenticate' ||
        normalized === 'proxy-authorization' ||
        normalized === 'te' ||
        normalized === 'trailer' ||
        normalized === 'transfer-encoding' ||
        normalized === 'upgrade'
    ) {
        return false
    }
    return !rewriteBody || (normalized !== 'content-length' && normalized !== 'content-encoding')
}

function normalizePreviewProxyBasePath(service: ISandboxManagedService): string | null {
    if (!isNonEmptyString(service.previewUrl)) {
        return null
    }

    try {
        const pathname = new URL(service.previewUrl, 'http://xpert.local').pathname
        return pathname.endsWith('/') ? pathname : `${pathname}/`
    } catch {
        return service.previewUrl.endsWith('/') ? service.previewUrl : `${service.previewUrl}/`
    }
}

function rewritePreviewRootPath(pathname: string, proxyBasePath: string): string {
    if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.startsWith(proxyBasePath)) {
        return pathname
    }
    return `${proxyBasePath}${pathname.replace(/^\/+/, '')}`
}

function rewritePreviewTextResponse(content: string, proxyBasePath: string): string {
    return content
        .replace(/(["'`])\/(?!\/)([^"'`\s<>)]*)/g, (_match, quote: string, pathname: string) => {
            return `${quote}${rewritePreviewRootPath(`/${pathname}`, proxyBasePath)}`
        })
        .replace(
            /(\b(?:src|href|action|poster|data|xlink:href)\s*=\s*)(\/(?!\/)[^\s"'<>]*)/gi,
            (_match, prefix: string, pathname: string) => `${prefix}${rewritePreviewRootPath(pathname, proxyBasePath)}`
        )
        .replace(
            /(url\(\s*)(\/(?!\/)[^"')\s]+)(\s*\))/gi,
            (_match, prefix: string, pathname: string, suffix: string) =>
                `${prefix}${rewritePreviewRootPath(pathname, proxyBasePath)}${suffix}`
        )
}

async function readRequestBody(request: SandboxServiceProxyRequest['request']): Promise<Buffer> {
    if (request.readableEnded || request.method === 'GET' || request.method === 'HEAD') {
        return Buffer.alloc(0)
    }

    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += buffer.byteLength
        if (size > MAX_PROXY_REQUEST_BYTES) {
            throw new Error(
                getNsjailMessage(
                    'NsJailProxyRequestTooLarge',
                    `Sandbox service proxy request exceeds ${MAX_PROXY_REQUEST_BYTES} bytes.`,
                    { maxBytes: MAX_PROXY_REQUEST_BYTES }
                )
            )
        }
        chunks.push(buffer)
    }
    return Buffer.concat(chunks)
}

class NsjailTerminalSession implements SandboxTerminalSession {
    private closed = false
    private exited = false

    constructor(
        private readonly client: NsjailRunnerClient,
        private readonly runtimeId: string,
        private readonly terminalId: string,
        private readonly options: SandboxTerminalOpenOptions,
        private readonly runWithRuntimeRecovery: <T>(operation: () => Promise<T>) => Promise<T>
    ) {
        void this.poll()
    }

    async write(data: string): Promise<void> {
        if (!this.closed) {
            await this.runWithRuntimeRecovery(() => this.client.writeTerminal(this.runtimeId, this.terminalId, data))
        }
    }

    async resize(cols: number, rows: number): Promise<void> {
        if (!this.closed) {
            await this.runWithRuntimeRecovery(() =>
                this.client.resizeTerminal(
                    this.runtimeId,
                    this.terminalId,
                    clampTerminalSize(cols, 80),
                    clampTerminalSize(rows, 24)
                )
            )
        }
    }

    async close(): Promise<void> {
        if (this.closed) {
            return
        }
        this.closed = true
        await this.runWithRuntimeRecovery(() => this.client.closeTerminal(this.runtimeId, this.terminalId))
    }

    private async poll(): Promise<void> {
        let retryDelayMs = TERMINAL_POLL_RETRY_MS
        while (!this.closed && !this.exited) {
            try {
                const event = await this.runWithRuntimeRecovery(() =>
                    this.client.pollTerminal(this.runtimeId, this.terminalId)
                )
                retryDelayMs = TERMINAL_POLL_RETRY_MS
                if (event.output) {
                    this.options.onOutput(event.output)
                }
                if (event.exited) {
                    this.exited = true
                    this.options.onExit({ exitCode: event.exitCode, signal: event.signal })
                    return
                }
            } catch (error) {
                if (this.closed) {
                    return
                }
                if (isPermanentNsjailRunnerRequestError(error) || !isRetryableNsjailRunnerRequestError(error)) {
                    this.exited = true
                    this.options.onError?.(error instanceof Error ? error : new Error(String(error)))
                    return
                }
                await sleep(retryDelayMs)
                retryDelayMs = Math.min(retryDelayMs * 2, TERMINAL_POLL_MAX_RETRY_MS)
            }
        }
    }
}

export type NsjailSandboxOptions = {
    client: NsjailRunnerClient
    environmentId?: string | null
    runtimeId: string
    workspacePath: string
    workingDirectory: string
}

export class NsjailSandbox
    extends BaseSandbox
    implements SandboxManagedServiceAdapter, SandboxServiceProxyAdapter, SandboxTerminalAdapter
{
    readonly id: string
    readonly environmentId?: string | null
    private runtimeGeneration = 0
    private runtimeRecreation: { generation: number; promise: Promise<void> } | null = null

    constructor(private readonly options: NsjailSandboxOptions) {
        super()
        this.id = `nsjail-${options.runtimeId}`
        this.environmentId = options.environmentId ?? null
        this.workingDirectory = options.workingDirectory
    }

    async execute(command: string, options?: SandboxExecutionOptions): Promise<ExecuteResponse> {
        return this.withRuntimeRecovery(() => this.options.client.execute(this.options.runtimeId, command, options))
    }

    override async streamExecute(
        command: string,
        onLine: (line: string) => void,
        options?: SandboxExecutionOptions
    ): Promise<ExecuteResponse> {
        return this.withRuntimeRecovery(() =>
            this.options.client.streamExecute(this.options.runtimeId, command, onLine, options)
        )
    }

    async uploadFiles(files: Array<[string, Uint8Array]>): Promise<FileUploadResponse[]> {
        return this.withRuntimeRecovery(() =>
            this.options.client.uploadFiles(
                this.options.runtimeId,
                files.map(([path, content]) => ({ contentBase64: Buffer.from(content).toString('base64'), path }))
            )
        )
    }

    async downloadFiles(paths: string[]): Promise<FileDownloadResponse[]> {
        const results = await this.withRuntimeRecovery(() =>
            this.options.client.downloadFiles(this.options.runtimeId, paths)
        )
        return results.map((result) => ({
            content: result.contentBase64 === null ? null : Buffer.from(result.contentBase64, 'base64'),
            error: result.error,
            path: result.path
        }))
    }

    async open(options: SandboxTerminalOpenOptions): Promise<SandboxTerminalSession> {
        const terminalId = await this.withRuntimeRecovery(() =>
            this.options.client.createTerminal(this.options.runtimeId, {
                cols: clampTerminalSize(options.cols, 80),
                rows: clampTerminalSize(options.rows, 24)
            })
        )
        return new NsjailTerminalSession(
            this.options.client,
            this.options.runtimeId,
            terminalId,
            options,
            (operation) => this.withRuntimeRecovery(operation)
        )
    }

    async startService(options: SandboxManagedServiceStartOptions): Promise<SandboxManagedServiceStartResult> {
        const startingState: SandboxManagedServiceStateChange = {
            actualPort: options.port ?? null,
            runtimeRef: toRuntimeRef(this.options.runtimeId, options.serviceId),
            startedAt: new Date(),
            status: 'starting',
            stoppedAt: null,
            transportMode: options.port ? 'http' : 'none'
        }
        await options.onStateChange?.(startingState)

        const request: NsjailServiceStartRequest = {
            command: options.command,
            cwd: options.cwd || this.workingDirectory,
            env: options.env ?? [],
            port: options.port ?? null,
            readyPattern: options.readyPattern ?? null,
            serviceId: options.serviceId
        }

        try {
            const state = toServiceStateChange(
                this.options.runtimeId,
                await this.withRuntimeRecovery(() => this.options.client.startService(this.options.runtimeId, request))
            )
            await options.onStateChange?.(state)
            return state
        } catch (error) {
            await options.onStateChange?.({
                ...startingState,
                exitCode: 1,
                status: 'failed',
                stoppedAt: new Date()
            })
            throw error
        }
    }

    async listServices(options: SandboxManagedServiceListOptions): Promise<SandboxManagedServiceListResult> {
        const states = await this.withRuntimeRecovery(() => this.options.client.listServices(this.options.runtimeId))
        const byId = new Map(states.map((state) => [state.serviceId, state]))
        return {
            services: options.services.map((service) => {
                const state = service.id ? byId.get(service.id) : null
                if (!state) {
                    return service.status === 'starting' ||
                        service.status === 'running' ||
                        service.status === 'stopping'
                        ? { ...service, status: 'lost' as const }
                        : service
                }
                return {
                    ...service,
                    ...toServiceStateChange(this.options.runtimeId, state)
                }
            })
        }
    }

    async getServiceLogs(options: SandboxManagedServiceLogsOptions): Promise<TSandboxManagedServiceLogs> {
        if (!options.service.id) {
            return { stderr: '', stdout: '' }
        }
        return this.withRuntimeRecovery(() =>
            this.options.client.getServiceLogs(
                this.options.runtimeId,
                options.service.id ?? '',
                options.tail && options.tail > 0 ? Math.trunc(options.tail) : 200
            )
        )
    }

    async stopService(options: SandboxManagedServiceStopOptions): Promise<SandboxManagedServiceStateChange> {
        if (!options.service.id) {
            return { status: 'stopped', stoppedAt: new Date() }
        }

        await options.onStateChange?.({
            actualPort: options.service.actualPort ?? null,
            runtimeRef: options.service.runtimeRef ?? null,
            status: 'stopping',
            stoppedAt: null,
            transportMode: options.service.transportMode ?? null
        })
        const state = toServiceStateChange(
            this.options.runtimeId,
            await this.withRuntimeRecovery(() =>
                this.options.client.stopService(this.options.runtimeId, options.service.id ?? '')
            )
        )
        await options.onStateChange?.(state)
        return state
    }

    async restartService(options: SandboxManagedServiceRestartOptions): Promise<SandboxManagedServiceStartResult> {
        await this.stopService({ onStateChange: options.onStateChange, service: options.service })
        return this.startService({
            command: options.command,
            cwd: options.cwd,
            env: options.env,
            metadata: options.metadata,
            onStateChange: options.onStateChange,
            port: options.port,
            previewPath: options.previewPath,
            readyPattern: options.readyPattern,
            serviceId: options.service.id ?? ''
        })
    }

    async proxyServiceRequest(request: SandboxServiceProxyRequest): Promise<void> {
        if (!request.service.id || request.service.status !== 'running') {
            request.response.statusCode = 502
            request.response.setHeader('content-type', 'text/plain; charset=utf-8')
            request.response.end(
                getNsjailMessage('NsJailServiceNotRunning', 'The selected sandbox service is not running.')
            )
            return
        }

        try {
            const body = await readRequestBody(request.request)
            const proxyRequest = {
                bodyBase64: body.toString('base64'),
                headers: normalizeRequestHeaders(request.request.headers),
                method: request.request.method ?? 'GET',
                path: request.path
            }
            const upstream = await this.withRuntimeRecovery(() =>
                this.options.client.proxyService(this.options.runtimeId, request.service.id ?? '', proxyRequest)
            )
            const proxyBasePath = normalizePreviewProxyBasePath(request.service)
            const rewriteBody = Boolean(
                proxyBasePath && shouldRewritePreviewResponse(upstream.headers, request.request.method)
            )

            request.response.statusCode = upstream.status
            upstream.headers.forEach((value, name) => {
                if (name.toLowerCase() !== 'set-cookie' && shouldForwardProxyResponseHeader(name, rewriteBody)) {
                    request.response.setHeader(name, value)
                }
            })
            const setCookies = upstream.headers.getSetCookie()
            if (setCookies.length && shouldForwardProxyResponseHeader('set-cookie', rewriteBody)) {
                request.response.setHeader('set-cookie', setCookies)
            }

            if (rewriteBody && proxyBasePath) {
                request.response.end(rewritePreviewTextResponse(await upstream.text(), proxyBasePath))
                return
            }

            if (!upstream.body) {
                request.response.end()
                return
            }
            const reader = upstream.body.getReader()
            let chunk = await reader.read()
            while (!chunk.done) {
                request.response.write(Buffer.from(chunk.value))
                chunk = await reader.read()
            }
            request.response.end()
        } catch (error) {
            if (!request.response.headersSent) {
                request.response.statusCode = 502
                request.response.setHeader('content-type', 'text/plain; charset=utf-8')
            }
            const reason = error instanceof Error ? error.message : String(error)
            request.response.end(
                getNsjailMessage('NsJailProxyRequestFailed', `Failed to proxy sandbox service request: ${reason}`, {
                    reason
                })
            )
        }
    }

    private async withRuntimeRecovery<T>(operation: () => Promise<T>): Promise<T> {
        const generation = this.runtimeGeneration
        try {
            return await operation()
        } catch (error) {
            if (!isNsjailRuntimeNotFoundError(error)) {
                throw error
            }
            await this.recreateRuntime(generation)
            return operation()
        }
    }

    private async recreateRuntime(failedGeneration: number): Promise<void> {
        if (failedGeneration !== this.runtimeGeneration) {
            return
        }

        const inFlight = this.runtimeRecreation
        if (inFlight?.generation === failedGeneration) {
            await inFlight.promise
            return
        }

        const request: NsjailRuntimeCreateRequest = {
            runtimeId: this.options.runtimeId,
            workingDirectory: this.workingDirectory,
            workspacePath: this.options.workspacePath
        }
        const promise = this.options.client.createRuntime(request).then(() => {
            if (this.runtimeGeneration === failedGeneration) {
                this.runtimeGeneration += 1
            }
        })
        this.runtimeRecreation = { generation: failedGeneration, promise }
        try {
            await promise
        } finally {
            if (this.runtimeRecreation?.promise === promise) {
                this.runtimeRecreation = null
            }
        }
    }
}
