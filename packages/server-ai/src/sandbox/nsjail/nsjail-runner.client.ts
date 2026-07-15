import type { FileOperationError, SandboxExecutionOptions } from '@xpert-ai/plugin-sdk'
import { resolveSandboxExecutionOptions } from '@xpert-ai/plugin-sdk'
import {
    NsjailExecutionRequest,
    NsjailExecutionResult,
    NsjailFileDownloadResult,
    NsjailFileUpload,
    NsjailFileUploadResult,
    NsjailProxyRequest,
    NsjailRunnerConfig,
    NsjailRuntimeCreateRequest,
    NsjailServiceLogs,
    NsjailServiceStartRequest,
    NsjailServiceState,
    NsjailTerminalCreateRequest,
    NsjailTerminalEvent
} from './nsjail.types'
import { getNsjailMessage } from './nsjail-i18n'

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
const RUNNER_GRACE_PERIOD_MS = 10_000
const RUNNER_HEALTH_TIMEOUT_MS = 2_000
const FILE_OPERATION_ERRORS = new Set<FileOperationError>([
    'file_not_found',
    'permission_denied',
    'is_directory',
    'invalid_path'
])

function isObjectLike(value: unknown): value is object {
    return typeof value === 'object' && value !== null
}

function readString(value: object, key: string): string | null {
    const property = Reflect.get(value, key)
    return typeof property === 'string' ? property : null
}

function readNullableString(value: object, key: string): string | null | undefined {
    const property = Reflect.get(value, key)
    return property === null ? null : typeof property === 'string' ? property : undefined
}

function readNumber(value: object, key: string): number | null {
    const property = Reflect.get(value, key)
    return typeof property === 'number' && Number.isFinite(property) ? property : null
}

function readNullableNumber(value: object, key: string): number | null | undefined {
    const property = Reflect.get(value, key)
    return property === null ? null : typeof property === 'number' && Number.isFinite(property) ? property : undefined
}

function readBoolean(value: object, key: string): boolean | null {
    const property = Reflect.get(value, key)
    return typeof property === 'boolean' ? property : null
}

function readFileOperationError(value: object): FileOperationError | null {
    const error = Reflect.get(value, 'error')
    return error === null || error === undefined
        ? null
        : typeof error === 'string' && FILE_OPERATION_ERRORS.has(error as FileOperationError)
          ? (error as FileOperationError)
          : 'invalid_path'
}

function parseExecutionResult(value: unknown): NsjailExecutionResult {
    if (!isObjectLike(value)) {
        throw new Error(
            getNsjailMessage(
                'NsJailRunnerInvalidExecutionResult',
                'NsJail Runner returned an invalid execution result.'
            )
        )
    }

    const output = readString(value, 'output')
    const exitCodeValue = Reflect.get(value, 'exitCode')
    const exitCode = exitCodeValue === null ? null : readNumber(value, 'exitCode')
    const truncated = readBoolean(value, 'truncated')
    const timedOut = readBoolean(value, 'timedOut')
    if (output === null || (exitCodeValue !== null && exitCode === null) || truncated === null || timedOut === null) {
        throw new Error(
            getNsjailMessage(
                'NsJailRunnerInvalidExecutionResult',
                'NsJail Runner returned an invalid execution result.'
            )
        )
    }

    return { exitCode, output, timedOut, truncated }
}

function parseFileUploadResults(value: unknown): NsjailFileUploadResult[] {
    if (!Array.isArray(value)) {
        throw new Error(
            getNsjailMessage('NsJailRunnerInvalidUploadResult', 'NsJail Runner returned an invalid upload result.')
        )
    }

    return value.map((entry) => {
        if (!isObjectLike(entry)) {
            throw new Error(
                getNsjailMessage('NsJailRunnerInvalidUploadResult', 'NsJail Runner returned an invalid upload result.')
            )
        }
        const path = readString(entry, 'path')
        if (path === null) {
            throw new Error(
                getNsjailMessage('NsJailRunnerInvalidUploadResult', 'NsJail Runner returned an invalid upload result.')
            )
        }
        return { error: readFileOperationError(entry), path }
    })
}

function parseFileDownloadResults(value: unknown): NsjailFileDownloadResult[] {
    if (!Array.isArray(value)) {
        throw new Error(
            getNsjailMessage('NsJailRunnerInvalidDownloadResult', 'NsJail Runner returned an invalid download result.')
        )
    }

    return value.map((entry) => {
        if (!isObjectLike(entry)) {
            throw new Error(
                getNsjailMessage(
                    'NsJailRunnerInvalidDownloadResult',
                    'NsJail Runner returned an invalid download result.'
                )
            )
        }
        const path = readString(entry, 'path')
        const contentValue = Reflect.get(entry, 'contentBase64')
        const contentBase64 = contentValue === null ? null : readString(entry, 'contentBase64')
        if (path === null || (contentValue !== null && contentBase64 === null)) {
            throw new Error(
                getNsjailMessage(
                    'NsJailRunnerInvalidDownloadResult',
                    'NsJail Runner returned an invalid download result.'
                )
            )
        }
        return { contentBase64, error: readFileOperationError(entry), path }
    })
}

const SERVICE_STATUSES = new Set(['starting', 'running', 'stopping', 'stopped', 'failed', 'lost'])
const SERVICE_TRANSPORT_MODES = new Set(['none', 'http'])

function parseServiceState(value: unknown): NsjailServiceState {
    if (!isObjectLike(value)) {
        throw new Error(
            getNsjailMessage('NsJailRunnerInvalidServiceState', 'NsJail Runner returned an invalid service state.')
        )
    }

    const serviceId = readString(value, 'serviceId')
    const status = readString(value, 'status')
    const transportMode = readString(value, 'transportMode')
    const actualPort = readNullableNumber(value, 'actualPort')
    const exitCode = readNullableNumber(value, 'exitCode')
    const signal = readNullableString(value, 'signal')
    const startedAt = readNullableString(value, 'startedAt')
    const stoppedAt = readNullableString(value, 'stoppedAt')
    if (
        serviceId === null ||
        status === null ||
        !SERVICE_STATUSES.has(status) ||
        transportMode === null ||
        !SERVICE_TRANSPORT_MODES.has(transportMode) ||
        actualPort === undefined ||
        exitCode === undefined ||
        signal === undefined ||
        startedAt === undefined ||
        stoppedAt === undefined
    ) {
        throw new Error(
            getNsjailMessage('NsJailRunnerInvalidServiceState', 'NsJail Runner returned an invalid service state.')
        )
    }

    return {
        actualPort,
        exitCode,
        serviceId,
        signal,
        startedAt,
        status: status as NsjailServiceState['status'],
        stoppedAt,
        transportMode: transportMode as NsjailServiceState['transportMode']
    }
}

function parseServiceStates(value: unknown): NsjailServiceState[] {
    if (!Array.isArray(value)) {
        throw new Error(
            getNsjailMessage('NsJailRunnerInvalidServiceList', 'NsJail Runner returned an invalid service list.')
        )
    }
    return value.map(parseServiceState)
}

function parseServiceLogs(value: unknown): NsjailServiceLogs {
    if (!isObjectLike(value)) {
        throw new Error(
            getNsjailMessage('NsJailRunnerInvalidServiceLogs', 'NsJail Runner returned invalid service logs.')
        )
    }
    const stdout = readString(value, 'stdout')
    const stderr = readString(value, 'stderr')
    if (stdout === null || stderr === null) {
        throw new Error(
            getNsjailMessage('NsJailRunnerInvalidServiceLogs', 'NsJail Runner returned invalid service logs.')
        )
    }
    return { stderr, stdout }
}

function parseTerminalId(value: unknown): string {
    if (!isObjectLike(value)) {
        throw new Error(
            getNsjailMessage(
                'NsJailRunnerInvalidTerminalSession',
                'NsJail Runner returned an invalid terminal session.'
            )
        )
    }
    const terminalId = readString(value, 'terminalId')
    if (!terminalId) {
        throw new Error(
            getNsjailMessage(
                'NsJailRunnerInvalidTerminalSession',
                'NsJail Runner returned an invalid terminal session.'
            )
        )
    }
    return terminalId
}

function parseTerminalEvent(value: unknown): NsjailTerminalEvent {
    if (!isObjectLike(value)) {
        throw new Error(
            getNsjailMessage('NsJailRunnerInvalidTerminalEvent', 'NsJail Runner returned an invalid terminal event.')
        )
    }
    const output = readString(value, 'output')
    const exited = readBoolean(value, 'exited')
    const exitCode = readNullableNumber(value, 'exitCode')
    const signal = readNullableNumber(value, 'signal')
    if (output === null || exited === null || exitCode === undefined || signal === undefined) {
        throw new Error(
            getNsjailMessage('NsJailRunnerInvalidTerminalEvent', 'NsJail Runner returned an invalid terminal event.')
        )
    }
    return {
        exitCode,
        exited,
        output,
        signal
    }
}

function parseHealthResult(value: unknown): boolean {
    return isObjectLike(value) && readString(value, 'status') === 'ok'
}

export class NsjailRunnerRequestError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly runnerMessage?: string
    ) {
        super(message)
        this.name = 'NsjailRunnerRequestError'
    }
}

class NsjailRunnerTimeoutError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'NsjailRunnerTimeoutError'
    }
}

export function isNsjailRuntimeNotFoundError(error: unknown): boolean {
    return (
        error instanceof NsjailRunnerRequestError &&
        error.status === 404 &&
        (error.runnerMessage ?? error.message) === 'NsJail runtime not found'
    )
}

export function isPermanentNsjailRunnerRequestError(error: unknown): boolean {
    return (
        error instanceof NsjailRunnerRequestError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408 &&
        error.status !== 429
    )
}

export function isRetryableNsjailRunnerRequestError(error: unknown): boolean {
    if (error instanceof NsjailRunnerRequestError) {
        return error.status === 408 || error.status === 429 || error.status >= 500
    }
    return error instanceof TypeError || error instanceof NsjailRunnerTimeoutError
}

export class NsjailRunnerClient {
    private readonly baseUrl: string

    constructor(private readonly config: NsjailRunnerConfig) {
        this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    }

    async isHealthy(): Promise<boolean> {
        const value = await this.requestJson('/health', { method: 'GET', timeoutMs: RUNNER_HEALTH_TIMEOUT_MS })
        return parseHealthResult(value)
    }

    async createRuntime(request: NsjailRuntimeCreateRequest): Promise<void> {
        await this.requestJson('/v1/runtimes', { body: request, method: 'POST' })
    }

    async destroyRuntime(runtimeId: string): Promise<void> {
        await this.requestJson(`/v1/runtimes/${encodeURIComponent(runtimeId)}`, { method: 'DELETE' })
    }

    async execute(
        runtimeId: string,
        command: string,
        options?: SandboxExecutionOptions
    ): Promise<NsjailExecutionResult> {
        const resolved = resolveSandboxExecutionOptions(options)
        const request: NsjailExecutionRequest = {
            command,
            maxOutputBytes: resolved.maxOutputBytes,
            timeoutMs: resolved.timeoutMs
        }
        const value = await this.requestJson(`/v1/runtimes/${encodeURIComponent(runtimeId)}/exec`, {
            body: request,
            method: 'POST',
            timeoutMs: resolved.timeoutMs + RUNNER_GRACE_PERIOD_MS
        })
        return parseExecutionResult(value)
    }

    async streamExecute(
        runtimeId: string,
        command: string,
        onLine: (line: string) => void,
        options?: SandboxExecutionOptions
    ): Promise<NsjailExecutionResult> {
        const resolved = resolveSandboxExecutionOptions(options)
        const response = await this.request(`/v1/runtimes/${encodeURIComponent(runtimeId)}/exec/stream`, {
            body: {
                command,
                maxOutputBytes: resolved.maxOutputBytes,
                timeoutMs: resolved.timeoutMs
            } satisfies NsjailExecutionRequest,
            method: 'POST',
            timeoutMs: resolved.timeoutMs + RUNNER_GRACE_PERIOD_MS
        })
        if (!response.body) {
            throw new Error(
                getNsjailMessage(
                    'NsJailRunnerEmptyStreamingResponse',
                    'NsJail Runner returned an empty streaming response.'
                )
            )
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let result: NsjailExecutionResult | null = null

        const consumeLine = (line: string) => {
            if (!line) {
                return
            }
            const event: unknown = JSON.parse(line)
            if (!isObjectLike(event)) {
                throw new Error(
                    getNsjailMessage(
                        'NsJailRunnerInvalidStreamEvent',
                        'NsJail Runner returned an invalid stream event.'
                    )
                )
            }
            const type = readString(event, 'type')
            if (type === 'line') {
                const data = readString(event, 'data')
                if (data === null) {
                    throw new Error(
                        getNsjailMessage(
                            'NsJailRunnerInvalidStreamLine',
                            'NsJail Runner returned an invalid stream line.'
                        )
                    )
                }
                onLine(data)
            } else if (type === 'result') {
                result = parseExecutionResult(Reflect.get(event, 'result'))
            }
        }

        let chunk = await reader.read()
        while (!chunk.done) {
            buffer += decoder.decode(chunk.value, { stream: true })
            let newlineIndex = buffer.indexOf('\n')
            while (newlineIndex >= 0) {
                consumeLine(buffer.slice(0, newlineIndex))
                buffer = buffer.slice(newlineIndex + 1)
                newlineIndex = buffer.indexOf('\n')
            }
            chunk = await reader.read()
        }
        buffer += decoder.decode()
        if (buffer.trim()) {
            consumeLine(buffer.trim())
        }
        if (!result) {
            throw new Error(
                getNsjailMessage(
                    'NsJailRunnerStreamMissingResult',
                    'NsJail Runner stream ended without an execution result.'
                )
            )
        }
        return result
    }

    async uploadFiles(runtimeId: string, files: NsjailFileUpload[]): Promise<NsjailFileUploadResult[]> {
        const value = await this.requestJson(`/v1/runtimes/${encodeURIComponent(runtimeId)}/files/upload`, {
            body: { files },
            method: 'POST'
        })
        return parseFileUploadResults(value)
    }

    async downloadFiles(runtimeId: string, paths: string[]): Promise<NsjailFileDownloadResult[]> {
        const value = await this.requestJson(`/v1/runtimes/${encodeURIComponent(runtimeId)}/files/download`, {
            body: { paths },
            method: 'POST'
        })
        return parseFileDownloadResults(value)
    }

    async createTerminal(runtimeId: string, request: NsjailTerminalCreateRequest): Promise<string> {
        const value = await this.requestJson(`/v1/runtimes/${encodeURIComponent(runtimeId)}/terminals`, {
            body: request,
            method: 'POST'
        })
        return parseTerminalId(value)
    }

    async pollTerminal(runtimeId: string, terminalId: string): Promise<NsjailTerminalEvent> {
        const value = await this.requestJson(
            `/v1/runtimes/${encodeURIComponent(runtimeId)}/terminals/${encodeURIComponent(terminalId)}/events`,
            { method: 'GET', timeoutMs: 35_000 }
        )
        return parseTerminalEvent(value)
    }

    async writeTerminal(runtimeId: string, terminalId: string, data: string): Promise<void> {
        await this.requestJson(
            `/v1/runtimes/${encodeURIComponent(runtimeId)}/terminals/${encodeURIComponent(terminalId)}/input`,
            { body: { data }, method: 'POST' }
        )
    }

    async resizeTerminal(runtimeId: string, terminalId: string, cols: number, rows: number): Promise<void> {
        await this.requestJson(
            `/v1/runtimes/${encodeURIComponent(runtimeId)}/terminals/${encodeURIComponent(terminalId)}/resize`,
            { body: { cols, rows }, method: 'POST' }
        )
    }

    async closeTerminal(runtimeId: string, terminalId: string): Promise<void> {
        await this.requestJson(
            `/v1/runtimes/${encodeURIComponent(runtimeId)}/terminals/${encodeURIComponent(terminalId)}`,
            { method: 'DELETE' }
        )
    }

    async startService(runtimeId: string, request: NsjailServiceStartRequest): Promise<NsjailServiceState> {
        const value = await this.requestJson(`/v1/runtimes/${encodeURIComponent(runtimeId)}/services`, {
            body: request,
            method: 'POST',
            timeoutMs: 40_000
        })
        return parseServiceState(value)
    }

    async listServices(runtimeId: string): Promise<NsjailServiceState[]> {
        const value = await this.requestJson(`/v1/runtimes/${encodeURIComponent(runtimeId)}/services`, {
            method: 'GET'
        })
        return parseServiceStates(value)
    }

    async getServiceLogs(runtimeId: string, serviceId: string, tail: number): Promise<NsjailServiceLogs> {
        const value = await this.requestJson(
            `/v1/runtimes/${encodeURIComponent(runtimeId)}/services/${encodeURIComponent(serviceId)}/logs?tail=${tail}`,
            { method: 'GET' }
        )
        return parseServiceLogs(value)
    }

    async stopService(runtimeId: string, serviceId: string): Promise<NsjailServiceState> {
        const value = await this.requestJson(
            `/v1/runtimes/${encodeURIComponent(runtimeId)}/services/${encodeURIComponent(serviceId)}`,
            { method: 'DELETE', timeoutMs: 10_000 }
        )
        return parseServiceState(value)
    }

    async proxyService(runtimeId: string, serviceId: string, request: NsjailProxyRequest): Promise<Response> {
        return this.request(
            `/v1/runtimes/${encodeURIComponent(runtimeId)}/services/${encodeURIComponent(serviceId)}/proxy`,
            { body: request, method: 'POST', timeoutMs: 0 }
        )
    }

    private async requestJson(
        pathname: string,
        options: { body?: unknown; method: string; timeoutMs?: number }
    ): Promise<unknown> {
        const response = await this.request(pathname, options)
        if (response.status === 204) {
            return null
        }
        return response.json()
    }

    private async request(
        pathname: string,
        options: { body?: unknown; method: string; timeoutMs?: number }
    ): Promise<Response> {
        const timeoutMs = options.timeoutMs === undefined ? DEFAULT_REQUEST_TIMEOUT_MS : options.timeoutMs
        const controller = timeoutMs > 0 ? new AbortController() : null
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null

        try {
            const response = await fetch(`${this.baseUrl}${pathname}`, {
                body: options.body === undefined ? undefined : JSON.stringify(options.body),
                headers: {
                    authorization: `Bearer ${this.config.token}`,
                    ...(options.body === undefined ? {} : { 'content-type': 'application/json' })
                },
                method: options.method,
                signal: controller?.signal
            })
            if (!response.ok) {
                let runnerMessage: string | undefined
                try {
                    const payload: unknown = await response.json()
                    if (isObjectLike(payload)) {
                        const error = readString(payload, 'error')
                        if (error) {
                            runnerMessage = error
                        }
                    }
                } catch {
                    // Preserve the HTTP status fallback.
                }
                const fallbackMessage = `NsJail Runner request failed with HTTP ${response.status}.`
                throw new NsjailRunnerRequestError(
                    getNsjailMessage('NsJailRunnerRequestFailed', fallbackMessage, {
                        reason: runnerMessage ?? fallbackMessage,
                        status: response.status
                    }),
                    response.status,
                    runnerMessage
                )
            }
            return response
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new NsjailRunnerTimeoutError(
                    getNsjailMessage(
                        'NsJailRunnerRequestTimedOut',
                        `NsJail Runner request timed out after ${timeoutMs}ms.`,
                        { timeoutMs }
                    )
                )
            }
            throw error
        } finally {
            if (timer) {
                clearTimeout(timer)
            }
        }
    }
}
