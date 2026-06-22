import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { IXpertToolset, MCPServerType, TMCPServer, TMcpStdioRuntimePolicy } from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { basename, isAbsolute, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { inspect } from 'node:util'
import {
    getPluginManagedMcpOptions,
    resolvePluginManagedRuntimePaths,
    type PluginRuntimePaths
} from './plugin-managed-runtime'
import type { TBuiltinToolsetParams } from '../../../shared'

const RUNNER_SPEC_ENV = 'XPERT_MCP_STDIO_RUNNER_SPEC'
const DEFAULT_STARTUP_TIMEOUT_MS = 15_000
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60_000
const DEFAULT_MAX_LIFETIME_MS = 2 * 60 * 60_000
const DEFAULT_MAX_CONCURRENT_PER_TENANT = 10
const STDERR_TAIL_MAX_BYTES = 16 * 1024
const CHILD_PID_MARKER = /\[xpert-mcp-stdio-runner\]\s+child pid=(\d+)/

export type McpRuntimeStatus = 'starting' | 'running' | 'closing' | 'closed' | 'failed'
export type McpRuntimeOrigin = 'agent-toolset' | 'mcp-app-host'

type ResolvedMcpStdioRuntimePolicy = Required<
    Pick<TMcpStdioRuntimePolicy, 'provider' | 'startupTimeoutMs' | 'idleTimeoutMs' | 'maxLifetimeMs'>
> &
    Pick<TMcpStdioRuntimePolicy, 'allowedCommands'>

export type McpRuntimeAuditSink = {
    recordStarting?: (runtime: McpStdioRuntimeHandle) => void | Promise<void>
    recordRunning?: (runtime: McpStdioRuntimeHandle) => void | Promise<void>
    recordClosed?: (runtime: McpStdioRuntimeHandle) => void | Promise<void>
    recordAppInstance?: (runtime: McpStdioRuntimeHandle, appInstanceId: string) => void | Promise<void>
}

export type ManagedServerResult = {
    server: TMCPServer
    runtime?: McpStdioRuntimeHandle
}

export type McpRuntimeListFilter = {
    tenantId?: string
    organizationId?: string
    workspaceId?: string
    toolsetId?: string
    pluginName?: string
    executionId?: string
    appInstanceId?: string
}

export type McpStdioRuntimeSnapshot = {
    id: string
    status: McpRuntimeStatus
    origin: McpRuntimeOrigin
    tenantId?: string
    organizationId?: string
    workspaceId?: string
    toolsetId?: string
    toolsetName?: string
    serverName: string
    pluginManaged: boolean
    pluginName?: string
    componentKey?: string
    pluginRuntimeId?: string
    xpertId?: string
    agentKey?: string
    executionId?: string
    conversationId?: string
    appInstanceId?: string
    command: string
    runnerPid?: number
    childPid?: number
    startedAt: string
    idleExpiresAt?: string
    maxLifetimeExpiresAt?: string
    closedAt?: string
    closeReason?: string
    stderrTail?: string
}

type RunnerSpec = {
    runtimeId: string
    command: string
    args: string[]
    env: Record<string, string>
    cwd: string
    startupTimeoutMs: number
    maxLifetimeMs: number
}

type TransportLike = {
    close?: () => Promise<void>
    stderr?: NodeJS.ReadableStream | null
    onclose?: () => void | Promise<void>
}

type ChildProcessLike = {
    pid?: number
    kill?: (signal?: NodeJS.Signals) => boolean
}

export class McpStdioRuntimeHandle {
    readonly id = randomUUID()
    readonly startedAt = new Date()
    status: McpRuntimeStatus = 'starting'
    runnerPid?: number
    childPid?: number
    stderrTail = ''
    closedAt?: Date
    closeReason?: string
    client?: MultiServerMCPClient
    transport?: TransportLike
    runnerProcess?: ChildProcessLike
    idleTimer?: NodeJS.Timeout
    maxLifetimeTimer?: NodeJS.Timeout
    idleExpiresAt?: Date
    maxLifetimeExpiresAt?: Date

    constructor(
        readonly context: {
            origin: McpRuntimeOrigin
            tenantId?: string
            organizationId?: string
            workspaceId?: string
            toolsetId?: string
            toolsetName?: string
            serverName: string
            pluginManaged: boolean
            pluginName?: string
            componentKey?: string
            pluginRuntimeId?: string
            xpertId?: string
            agentKey?: string
            executionId?: string
            conversationId?: string
            appInstanceId?: string
            command: string
            args: string[]
            policy: ResolvedMcpStdioRuntimePolicy
        }
    ) {}
}

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
    if (!value?.trim()) {
        return fallback
    }
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function parsePositiveIntegerEnv(value: string | undefined, fallback: number) {
    if (!value?.trim()) {
        return fallback
    }
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseCommandAllowList(value: string | undefined) {
    return new Set(
        (value ?? '')
            .split(/[;,]/)
            .map((item) => item.trim())
            .filter(Boolean)
    )
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readToolsetRuntimePolicy(toolset: Partial<IXpertToolset>): TMcpStdioRuntimePolicy | undefined {
    return isRecord(toolset.options?.mcpRuntime) ? (toolset.options.mcpRuntime as TMcpStdioRuntimePolicy) : undefined
}

function clampPositive(value: number | undefined, fallback: number, max: number) {
    if (!Number.isFinite(value) || !value || value <= 0) {
        return fallback
    }
    return Math.min(value, max)
}

function createRunnerSpecEnv(spec: RunnerSpec) {
    return Buffer.from(JSON.stringify(spec), 'utf8').toString('base64')
}

function getRunnerPath() {
    return resolve(__dirname, 'mcp-stdio-runner.js')
}

function appendTail(current: string, chunk: string) {
    const next = current + chunk
    if (Buffer.byteLength(next, 'utf8') <= STDERR_TAIL_MAX_BYTES) {
        return next
    }
    return Buffer.from(next, 'utf8').subarray(-STDERR_TAIL_MAX_BYTES).toString('utf8')
}

function safeEnv(env: Record<string, string> | undefined) {
    const result: Record<string, string> = {}
    if (process.env.PATH) {
        result.PATH = process.env.PATH
    }
    for (const [key, value] of Object.entries(env ?? {})) {
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof value === 'string') {
            result[key] = value
        }
    }
    return result
}

function commandMatchesAllowList(command: string, allowList: Set<string>) {
    if (allowList.size === 0) {
        return false
    }
    return allowList.has(command) || allowList.has(basename(command))
}

function realpathIfExists(path: string) {
    return existsSync(path) ? realpathSync(path) : null
}

function assertInsideRoot(target: string, root: string) {
    const realTarget = realpathIfExists(target)
    const realRoot = realpathIfExists(root)
    if (!realTarget || !realRoot) {
        throw new Error(`MCP stdio entry '${target}' does not exist`)
    }
    const normalizedRoot = realRoot.endsWith('/') ? realRoot : `${realRoot}/`
    if (realTarget !== realRoot && !realTarget.startsWith(normalizedRoot)) {
        throw new Error(`MCP stdio entry '${target}' is outside the plugin root`)
    }
    return realTarget
}

function isNodeCommand(command: string) {
    return (
        basename(command) === 'node' || command === process.execPath || basename(command) === basename(process.execPath)
    )
}

function resolveNodeEntryArg(args: string[]) {
    for (const arg of args) {
        if (!arg || arg.startsWith('-')) {
            continue
        }
        return arg
    }
    return null
}

function resolvePluginEntry(server: TMCPServer, paths: PluginRuntimePaths) {
    const entryArg = resolveNodeEntryArg(server.args ?? [])
    if (!entryArg) {
        throw new Error('Plugin-managed MCP stdio server must provide a Node.js entry file argument')
    }
    const entryPath = isAbsolute(entryArg) ? entryArg : resolve(paths.pluginRoot, entryArg)
    return assertInsideRoot(entryPath, paths.pluginRoot)
}

export class McpStdioRuntimeManager {
    readonly #runtimes = new Map<string, McpStdioRuntimeHandle>()
    readonly #clientRuntimes = new WeakMap<MultiServerMCPClient, McpStdioRuntimeHandle[]>()
    readonly #closedClients = new WeakSet<MultiServerMCPClient>()
    #auditSink?: McpRuntimeAuditSink

    setAuditSink(auditSink: McpRuntimeAuditSink | undefined) {
        this.#auditSink = auditSink
    }

    isEnabled() {
        return parseBooleanEnv(process.env.XPERT_MCP_STDIO_RUNTIME_ENABLED, !environment.production)
    }

    assertInitScriptsAllowed(server: TMCPServer, serverName: string) {
        if (!server.initScripts?.trim()) {
            return
        }
        const allowed = parseBooleanEnv(process.env.XPERT_MCP_STDIO_INIT_SCRIPTS_ENABLED, !environment.production)
        if (!allowed) {
            throw new Error(`MCP stdio server '${serverName}' uses initScripts, which are disabled in this environment`)
        }
    }

    prepareServer(
        toolset: Partial<IXpertToolset>,
        serverName: string,
        server: TMCPServer,
        runtimeContext: Partial<TBuiltinToolsetParams> = {}
    ): ManagedServerResult {
        const transport = server.type?.toLowerCase()
        if (transport !== MCPServerType.STDIO && !server.command) {
            return { server }
        }

        if (!this.isEnabled()) {
            throw new Error(
                `MCP stdio runtime is disabled. Set XPERT_MCP_STDIO_RUNTIME_ENABLED=true to allow stdio MCP servers.`
            )
        }

        const pluginOptions = getPluginManagedMcpOptions(toolset)
        const pluginManaged = Boolean(pluginOptions)
        const pluginName = pluginOptions?.pluginName
        const policy = this.resolvePolicy(toolset, server)
        const originalCommand = server.command?.trim()
        if (!originalCommand) {
            throw new Error(`MCP stdio server '${serverName}' is missing command`)
        }

        let command = originalCommand
        let args = [...(server.args ?? [])]
        let cwd = process.cwd()
        if (pluginManaged) {
            const paths = resolvePluginManagedRuntimePaths(toolset)
            if (!paths) {
                throw new Error(`Plugin-managed MCP stdio server '${serverName}' cannot resolve plugin runtime root`)
            }
            if (!isNodeCommand(command)) {
                throw new Error(`Plugin-managed MCP stdio server '${serverName}' must be launched with Node.js`)
            }
            const entryPath = resolvePluginEntry(server, paths)
            const entryArg = resolveNodeEntryArg(args)
            args = args.map((arg) => (arg === entryArg ? entryPath : arg))
            command = process.execPath
            cwd = paths.pluginData
            mkdirSync(cwd, { recursive: true })
        } else {
            this.assertCustomCommandAllowed(command)
        }

        this.assertRequestedCommandAllowed(command, originalCommand, policy)
        if (policy.provider !== 'local-process') {
            throw new Error(`MCP stdio runtime provider '${policy.provider}' is not supported by this deployment`)
        }
        this.assertTenantLimit(toolset.tenantId)

        const runtime = new McpStdioRuntimeHandle({
            origin: runtimeContext.appInstanceId ? 'mcp-app-host' : 'agent-toolset',
            tenantId: toolset.tenantId,
            organizationId: toolset.organizationId,
            workspaceId: toolset.workspaceId,
            toolsetId: toolset.id,
            toolsetName: toolset.name,
            serverName,
            pluginManaged,
            pluginName,
            componentKey: pluginOptions?.componentKey,
            pluginRuntimeId: pluginManaged ? toolset.id : undefined,
            xpertId:
                runtimeContext.xpertId ??
                (typeof toolset.options?.xpertId === 'string' ? toolset.options.xpertId : undefined),
            agentKey: runtimeContext.agentKey,
            executionId: runtimeContext.executionId,
            conversationId: runtimeContext.conversationId,
            appInstanceId: runtimeContext.appInstanceId,
            command: originalCommand,
            args: server.args ?? [],
            policy
        })
        runtime.maxLifetimeExpiresAt = new Date(runtime.startedAt.getTime() + policy.maxLifetimeMs)
        this.#runtimes.set(runtime.id, runtime)
        this.notifyAudit('recordStarting', runtime)

        const runnerSpec: RunnerSpec = {
            runtimeId: runtime.id,
            command,
            args,
            cwd,
            env: safeEnv(server.env),
            startupTimeoutMs: policy.startupTimeoutMs,
            maxLifetimeMs: policy.maxLifetimeMs
        }

        runtime.maxLifetimeTimer = setTimeout(() => {
            this.closeRuntime(runtime.id, 'max-lifetime-timeout').catch(() => undefined)
        }, policy.maxLifetimeMs)
        runtime.maxLifetimeTimer.unref?.()

        return {
            runtime,
            server: {
                ...server,
                command: process.execPath,
                args: [getRunnerPath()],
                env: {
                    [RUNNER_SPEC_ENV]: createRunnerSpecEnv(runnerSpec)
                },
                stderr: 'pipe',
                initScripts: undefined
            }
        }
    }

    attachClient(client: MultiServerMCPClient, runtimes: McpStdioRuntimeHandle[]) {
        this.#closedClients.delete(client)
        if (!runtimes.length) {
            return
        }

        const transports = Reflect.get(client, '_transportInstances')
        for (const runtime of runtimes) {
            runtime.client = client
            const transport = isRecord(transports)
                ? (Reflect.get(transports, runtime.context.serverName) as TransportLike)
                : null
            if (transport) {
                runtime.transport = transport
                runtime.runnerProcess = Reflect.get(transport, '_process') as ChildProcessLike
                runtime.runnerPid = runtime.runnerProcess?.pid
                this.attachTransportClose(runtime, transport)
                this.attachStderr(runtime, transport)
            }
            runtime.status = 'running'
            this.touchRuntime(runtime)
            this.notifyAudit('recordRunning', runtime)
        }
        this.#clientRuntimes.set(client, runtimes)
    }

    failRuntimes(runtimes: McpStdioRuntimeHandle[], error: unknown) {
        const message = error instanceof Error ? error.message : inspect(error)
        for (const runtime of runtimes) {
            runtime.status = 'failed'
            runtime.closeReason = message
            runtime.closedAt = new Date()
            this.clearTimers(runtime)
            this.notifyAudit('recordClosed', runtime)
            this.#runtimes.delete(runtime.id)
        }
    }

    touchClient(client: MultiServerMCPClient) {
        for (const runtime of this.#clientRuntimes.get(client) ?? []) {
            this.touchRuntime(runtime)
        }
    }

    isClientRuntimeUsable(client: MultiServerMCPClient) {
        if (this.#closedClients.has(client)) {
            return false
        }
        const runtimes = this.#clientRuntimes.get(client)
        if (!runtimes?.length) {
            return true
        }
        return runtimes.every((runtime) => runtime.status === 'starting' || runtime.status === 'running')
    }

    list(filter: McpRuntimeListFilter = {}): McpStdioRuntimeSnapshot[] {
        for (const runtime of Array.from(this.#runtimes.values())) {
            this.reconcileRuntimeLiveness(runtime)
        }
        return Array.from(this.#runtimes.values())
            .filter((runtime) => this.matchesFilter(runtime, filter))
            .map((runtime) => this.snapshot(runtime))
    }

    async closeClient(client: MultiServerMCPClient, reason = 'client-close') {
        this.#closedClients.add(client)
        const runtimes = this.#clientRuntimes.get(client) ?? []
        await Promise.all(runtimes.map((runtime) => this.closeHandle(runtime, reason)))
        this.#clientRuntimes.delete(client)
    }

    async closeRuntime(runtimeId: string, reason = 'admin-stop') {
        const runtime = this.#runtimes.get(runtimeId)
        if (!runtime || !this.isClosableRuntime(runtime)) {
            return false
        }
        await this.closeHandle(runtime, reason)
        return true
    }

    async killByFilter(filter: McpRuntimeListFilter, reason = 'admin-kill') {
        const runtimes = Array.from(this.#runtimes.values()).filter(
            (runtime) => this.isClosableRuntime(runtime) && this.matchesFilter(runtime, filter)
        )
        await Promise.all(runtimes.map((runtime) => this.closeHandle(runtime, reason)))
        return runtimes.length
    }

    attachAppInstance(client: MultiServerMCPClient, appInstanceId: string) {
        for (const runtime of this.#clientRuntimes.get(client) ?? []) {
            if (!runtime.context.appInstanceId) {
                runtime.context.appInstanceId = appInstanceId
                this.notifyAudit('recordAppInstance', runtime, appInstanceId)
            }
        }
    }

    private resolvePolicy(toolset: Partial<IXpertToolset>, server: TMCPServer) {
        const serverPolicy = server.runtime ?? {}
        const toolsetPolicy = readToolsetRuntimePolicy(toolset) ?? {}
        const requested = {
            ...serverPolicy,
            ...toolsetPolicy
        }
        return {
            provider: requested.provider ?? 'local-process',
            allowedCommands: requested.allowedCommands ?? [],
            startupTimeoutMs: clampPositive(
                requested.startupTimeoutMs,
                parsePositiveIntegerEnv(process.env.XPERT_MCP_STDIO_STARTUP_TIMEOUT_MS, DEFAULT_STARTUP_TIMEOUT_MS),
                60_000
            ),
            idleTimeoutMs: clampPositive(
                requested.idleTimeoutMs,
                parsePositiveIntegerEnv(process.env.XPERT_MCP_STDIO_IDLE_TIMEOUT_MS, DEFAULT_IDLE_TIMEOUT_MS),
                24 * 60 * 60_000
            ),
            maxLifetimeMs: clampPositive(
                requested.maxLifetimeMs,
                parsePositiveIntegerEnv(process.env.XPERT_MCP_STDIO_MAX_LIFETIME_MS, DEFAULT_MAX_LIFETIME_MS),
                24 * 60 * 60_000
            )
        }
    }

    private assertCustomCommandAllowed(command: string) {
        const platformAllowList = parseCommandAllowList(process.env.XPERT_MCP_STDIO_ALLOWED_COMMANDS)
        if (!environment.production && platformAllowList.size === 0) {
            return
        }
        if (!commandMatchesAllowList(command, platformAllowList)) {
            throw new Error(`Custom MCP stdio command '${command}' is not allowed by platform policy`)
        }
    }

    private assertRequestedCommandAllowed(command: string, originalCommand: string, policy: TMcpStdioRuntimePolicy) {
        const requestedAllowList = new Set(policy.allowedCommands ?? [])
        if (
            requestedAllowList.size &&
            !commandMatchesAllowList(command, requestedAllowList) &&
            !commandMatchesAllowList(originalCommand, requestedAllowList)
        ) {
            throw new Error(`MCP stdio command '${originalCommand}' is not allowed by toolset runtime policy`)
        }
    }

    private assertTenantLimit(tenantId?: string) {
        const max = parsePositiveIntegerEnv(
            process.env.XPERT_MCP_STDIO_MAX_CONCURRENT_PER_TENANT,
            DEFAULT_MAX_CONCURRENT_PER_TENANT
        )
        const count = Array.from(this.#runtimes.values()).filter(
            (runtime) =>
                runtime.context.tenantId === tenantId && (runtime.status === 'starting' || runtime.status === 'running')
        ).length
        if (count >= max) {
            throw new Error(`MCP stdio runtime limit exceeded for tenant '${tenantId ?? 'default'}'`)
        }
    }

    private touchRuntime(runtime: McpStdioRuntimeHandle) {
        if (runtime.status !== 'running') {
            return
        }
        if (runtime.idleTimer) {
            clearTimeout(runtime.idleTimer)
        }
        runtime.idleExpiresAt = new Date(Date.now() + runtime.context.policy.idleTimeoutMs)
        runtime.idleTimer = setTimeout(() => {
            this.closeRuntime(runtime.id, 'idle-timeout').catch(() => undefined)
        }, runtime.context.policy.idleTimeoutMs)
        runtime.idleTimer.unref?.()
    }

    private attachTransportClose(runtime: McpStdioRuntimeHandle, transport: TransportLike) {
        const originalOnClose = transport.onclose
        transport.onclose = async () => {
            runtime.status = runtime.closeReason ? runtime.status : 'closed'
            runtime.closedAt = runtime.closedAt ?? new Date()
            runtime.closeReason = runtime.closeReason ?? 'transport-close'
            this.clearTimers(runtime)
            this.notifyAudit('recordClosed', runtime)
            this.#runtimes.delete(runtime.id)
            await originalOnClose?.()
        }
    }

    private attachStderr(runtime: McpStdioRuntimeHandle, transport: TransportLike) {
        const stderr = transport.stderr
        stderr?.on?.('data', (data: Buffer | string) => {
            const chunk = data.toString()
            const childMatch = CHILD_PID_MARKER.exec(chunk)
            if (childMatch?.[1]) {
                runtime.childPid = Number.parseInt(childMatch[1], 10)
            }
            runtime.stderrTail = appendTail(runtime.stderrTail, chunk)
        })
    }

    private async closeHandle(runtime: McpStdioRuntimeHandle, reason: string) {
        if (runtime.status === 'closed' || runtime.status === 'closing') {
            return
        }
        runtime.status = 'closing'
        runtime.closeReason = reason
        this.clearTimers(runtime)
        try {
            await runtime.transport?.close?.()
        } catch {
            this.killProcess(runtime.runnerPid, 'SIGTERM')
        }
        this.killProcessGroup(runtime.childPid, 'SIGTERM')
        runtime.status = 'closed'
        runtime.closedAt = new Date()
        this.notifyAudit('recordClosed', runtime)
        this.#runtimes.delete(runtime.id)
    }

    private clearTimers(runtime: McpStdioRuntimeHandle) {
        if (runtime.idleTimer) {
            clearTimeout(runtime.idleTimer)
            runtime.idleTimer = undefined
        }
        if (runtime.maxLifetimeTimer) {
            clearTimeout(runtime.maxLifetimeTimer)
            runtime.maxLifetimeTimer = undefined
        }
    }

    private killProcess(pid: number | undefined, signal: NodeJS.Signals) {
        if (!pid) {
            return
        }
        try {
            process.kill(pid, signal)
        } catch {
            // Process may already be gone.
        }
    }

    private killProcessGroup(pid: number | undefined, signal: NodeJS.Signals) {
        if (!pid) {
            return
        }
        try {
            if (process.platform === 'win32') {
                process.kill(pid, signal)
            } else {
                process.kill(-pid, signal)
            }
        } catch {
            // Process group may already be gone.
        }
    }

    private reconcileRuntimeLiveness(runtime: McpStdioRuntimeHandle) {
        if (!this.isClosableRuntime(runtime) || !runtime.runnerPid) {
            return
        }
        if (this.isPidAlive(runtime.runnerPid)) {
            return
        }
        runtime.status = 'failed'
        runtime.closedAt = new Date()
        runtime.closeReason = runtime.closeReason ?? 'runner-process-exited'
        this.clearTimers(runtime)
        this.notifyAudit('recordClosed', runtime)
        this.#runtimes.delete(runtime.id)
    }

    private isPidAlive(pid: number) {
        try {
            process.kill(pid, 0)
            return true
        } catch (error) {
            return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EPERM')
        }
    }

    private matchesFilter(runtime: McpStdioRuntimeHandle, filter: McpRuntimeListFilter) {
        return (
            (!filter.tenantId || runtime.context.tenantId === filter.tenantId) &&
            (!filter.organizationId || runtime.context.organizationId === filter.organizationId) &&
            (!filter.workspaceId || runtime.context.workspaceId === filter.workspaceId) &&
            (!filter.toolsetId || runtime.context.toolsetId === filter.toolsetId) &&
            (!filter.pluginName || runtime.context.pluginName === filter.pluginName) &&
            (!filter.executionId || runtime.context.executionId === filter.executionId) &&
            (!filter.appInstanceId || runtime.context.appInstanceId === filter.appInstanceId)
        )
    }

    private isClosableRuntime(runtime: McpStdioRuntimeHandle) {
        return runtime.status !== 'closed' && runtime.status !== 'closing'
    }

    private snapshot(runtime: McpStdioRuntimeHandle): McpStdioRuntimeSnapshot {
        return {
            id: runtime.id,
            status: runtime.status,
            origin: runtime.context.origin,
            tenantId: runtime.context.tenantId,
            organizationId: runtime.context.organizationId,
            workspaceId: runtime.context.workspaceId,
            toolsetId: runtime.context.toolsetId,
            toolsetName: runtime.context.toolsetName,
            serverName: runtime.context.serverName,
            pluginManaged: runtime.context.pluginManaged,
            pluginName: runtime.context.pluginName,
            componentKey: runtime.context.componentKey,
            pluginRuntimeId: runtime.context.pluginRuntimeId,
            xpertId: runtime.context.xpertId,
            agentKey: runtime.context.agentKey,
            executionId: runtime.context.executionId,
            conversationId: runtime.context.conversationId,
            appInstanceId: runtime.context.appInstanceId,
            command: [runtime.context.command, ...runtime.context.args].filter(Boolean).join(' '),
            runnerPid: runtime.runnerPid,
            childPid: runtime.childPid,
            startedAt: runtime.startedAt.toISOString(),
            idleExpiresAt: runtime.idleExpiresAt?.toISOString(),
            maxLifetimeExpiresAt: runtime.maxLifetimeExpiresAt?.toISOString(),
            closedAt: runtime.closedAt?.toISOString(),
            closeReason: runtime.closeReason,
            stderrTail: runtime.stderrTail
        }
    }

    private notifyAudit<K extends keyof McpRuntimeAuditSink>(
        method: K,
        runtime: McpStdioRuntimeHandle,
        ...args: K extends 'recordAppInstance' ? [string] : []
    ) {
        const handler = this.#auditSink?.[method]
        if (typeof handler !== 'function') {
            return
        }
        Promise.resolve((handler as (...handlerArgs: unknown[]) => unknown)(runtime, ...args)).catch(() => undefined)
    }
}

export const mcpStdioRuntimeManager = new McpStdioRuntimeManager()
