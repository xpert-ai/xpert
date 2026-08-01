import type { ExecuteResponse, FileOperationError } from '@xpert-ai/plugin-sdk'
import type { TSandboxManagedServiceStatus, TSandboxManagedServiceTransportMode } from '@xpert-ai/contracts'

export type NsjailRunnerConfig = {
    baseUrl: string
    token: string
}

export type NsjailRuntimeCreateRequest = {
    runtimeId: string
    workingDirectory: string
    workspacePath: string
}

export type NsjailExecutionRequest = {
    command: string
    maxOutputBytes: number
    timeoutMs: number
}

export type NsjailExecutionResult = ExecuteResponse

export type NsjailFileUpload = {
    contentBase64: string
    path: string
}

export type NsjailFileUploadResult = {
    error: FileOperationError | null
    path: string
}

export type NsjailFileDownloadResult = {
    contentBase64: string | null
    error: FileOperationError | null
    path: string
}

export type NsjailTerminalCreateRequest = {
    cols: number
    rows: number
}

export type NsjailTerminalEvent = {
    exitCode: number | null
    exited: boolean
    output: string
    signal: number | null
}

export type NsjailServiceStartRequest = {
    command: string
    cwd: string
    env: Array<{ name: string; value: string }>
    port: number | null
    readyPattern: string | null
    serviceId: string
}

export type NsjailServiceState = {
    actualPort: number | null
    exitCode: number | null
    serviceId: string
    signal: string | null
    startedAt: string | null
    status: TSandboxManagedServiceStatus
    stoppedAt: string | null
    transportMode: TSandboxManagedServiceTransportMode
}

export type NsjailServiceLogs = {
    stderr: string
    stdout: string
}

export type NsjailProxyRequest = {
    bodyBase64: string
    headers: { [name: string]: string }
    method: string
    path: string
}
