import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { access, chmod, lstat, mkdir, open, readFile, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { Injectable } from '@nestjs/common'
import {
    isDevelopmentSandboxRuntimeEnvironment,
    SandboxRuntimeProviderStrategy,
    type ISandboxRuntimeProvider,
    type SandboxRuntimeBinding,
    type SandboxRuntimeBindingHealth,
    type SandboxRuntimeCreateOptions,
    type SandboxRuntimeDestroyOptions,
    type SandboxRuntimeExecuteResponse,
    type SandboxRuntimeExecutionOptions,
    type SandboxRuntimeFileDownloadResponse,
    type SandboxRuntimeFileOperationError,
    type SandboxRuntimeFileUploadResponse,
    type SandboxRuntimeInstance,
    type SandboxRuntimeReadOnlyFile,
    type SandboxRuntimeTerminationReason
} from '@xpert-ai/plugin-sdk'
import { DEFAULT_BROWSER_RUNTIME_PROFILE, VIDEO_BROWSER_RUNTIME_PROFILE } from './sandbox-runtime-definition.registry'

export const LOCAL_BROWSER_RUNTIME_PROVIDER = 'local-browser-runtime'
export const LOCAL_BROWSER_RUNTIME_BINDING = 'local-browser-runtime:browser-playwright-1.61-v1'
export const LOCAL_VIDEO_BROWSER_RUNTIME_BINDING = 'local-browser-runtime:browser-video-playwright-1.61-v1'

const LOCAL_PROVIDER_VERSION = '1.0.0'
const LOCAL_BINDING_PRIORITY = 10_000
const HEALTH_TIMEOUT_MS = 15_000
const HEALTH_CACHE_TTL_MS = 30_000
const DEFAULT_OUTPUT_LIMIT = 4 * 1024 * 1024
const LOCAL_BROWSER_INSTALL_COMMAND = 'corepack pnpm --filter @xpert-ai/sandbox-runtime install:browser'
const LOCAL_VIDEO_INSTALL_COMMAND = 'corepack pnpm --filter @xpert-ai/sandbox-runtime install:video'
const execFileAsync = promisify(execFile)

type LocalRuntimeConfiguration = {
    bindingId: string
    imageFamily: 'browser' | 'browser-video'
    artifactReference: string
    installCommand: string
    requiresFfmpeg: boolean
}

const LOCAL_RUNTIME_CONFIGURATIONS: Readonly<Record<string, LocalRuntimeConfiguration>> = {
    [DEFAULT_BROWSER_RUNTIME_PROFILE]: {
        bindingId: LOCAL_BROWSER_RUNTIME_BINDING,
        imageFamily: 'browser',
        artifactReference: 'xpert-source://sandbox-runtime/browser-playwright-1.61-v1',
        installCommand: LOCAL_BROWSER_INSTALL_COMMAND,
        requiresFfmpeg: false
    },
    [VIDEO_BROWSER_RUNTIME_PROFILE]: {
        bindingId: LOCAL_VIDEO_BROWSER_RUNTIME_BINDING,
        imageFamily: 'browser-video',
        artifactReference: 'xpert-source://sandbox-runtime/browser-video-playwright-1.61-v1',
        installCommand: LOCAL_VIDEO_INSTALL_COMMAND,
        requiresFfmpeg: true
    }
}

/**
 * Development-only Browser Runtime backed by a child process on the Xpert host.
 *
 * This Provider deliberately advertises weaker guarantees than the Browser
 * Definition. Its developmentOnly Binding is the only reason Core may select
 * it, and every executable method independently rejects production mode.
 */
@Injectable()
@SandboxRuntimeProviderStrategy(LOCAL_BROWSER_RUNTIME_PROVIDER)
export class LocalBrowserRuntimeProvider implements ISandboxRuntimeProvider {
    readonly type = LOCAL_BROWSER_RUNTIME_PROVIDER
    readonly version = LOCAL_PROVIDER_VERSION
    readonly capabilities = {
        isolation: 'process',
        ephemeral: true,
        resourceLimits: false,
        networkPolicy: false,
        readOnlyRootFilesystem: false,
        readOnlyFileMounts: true
    } as const

    private readonly instances = new Map<string, LocalBrowserRuntimeInstance>()
    private healthCache?: { key: string; expiresAt: number; health: SandboxRuntimeBindingHealth }

    /** Publishes last-resort Bindings only in explicit development/test mode. */
    listBindings(): readonly SandboxRuntimeBinding[] {
        if (!isDevelopmentSandboxRuntimeEnvironment()) return []
        return Object.entries(LOCAL_RUNTIME_CONFIGURATIONS).map(([runtimeProfile, configuration]) =>
            localBrowserBinding(runtimeProfile, configuration)
        )
    }

    /** Verifies the pinned local Runner, Runtime manifest, and Playwright browser artifact. */
    async getBindingHealth(input: {
        definition: SandboxRuntimeCreateOptions['definition']
        binding: SandboxRuntimeBinding
    }): Promise<SandboxRuntimeBindingHealth> {
        if (!isDevelopmentSandboxRuntimeEnvironment()) {
            return {
                available: false,
                reason: 'local-browser-runtime is disabled outside development/test.'
            }
        }
        if (!isLocalBinding(input.binding, input.definition.name)) {
            return { available: false, reason: 'Local Browser Runtime Binding does not match the Definition.' }
        }
        const cacheKey = `${input.definition.name}:${input.definition.sandboxRuntimeVersion}:${input.definition.expectedManifest.runnerHostSha256 ?? ''}`
        if (this.healthCache?.key === cacheKey && this.healthCache.expiresAt > Date.now()) {
            return this.healthCache.health
        }
        const health = await this.probeBindingHealth(input.definition)
        this.healthCache = { key: cacheKey, expiresAt: Date.now() + HEALTH_CACHE_TTL_MS, health }
        return health
    }

    private async probeBindingHealth(
        definition: SandboxRuntimeCreateOptions['definition']
    ): Promise<SandboxRuntimeBindingHealth> {
        try {
            const runtime = await resolveLocalRuntimeAssets(definition)
            const manifestResult = await runProcess(runtime.nodePath, [runtime.runnerPath, '--manifest'], {
                timeoutMs: HEALTH_TIMEOUT_MS,
                maxOutputBytes: 256 * 1024,
                cwd: runtime.root,
                env: runtime.environment
            })
            if (manifestResult.exitCode !== 0) {
                return { available: false, reason: manifestResult.output || 'Local Runtime manifest probe failed.' }
            }
            const manifest = parseStringRecord(manifestResult.output, 'Local Browser Runtime manifest')
            const mismatch = manifestMismatch(definition.expectedManifest, manifest)
            if (mismatch) return { available: false, reason: mismatch, manifest }

            const browserResult = await runProcess(runtime.nodePath, [runtime.runnerPath, '--browser-health'], {
                timeoutMs: HEALTH_TIMEOUT_MS,
                maxOutputBytes: 256 * 1024,
                cwd: runtime.root,
                env: runtime.environment
            })
            if (browserResult.exitCode !== 0) {
                return {
                    available: false,
                    reason: `${browserResult.output || 'Playwright Chromium is not installed.'} Run "${localRuntimeConfiguration(definition.name).installCommand}" from the Xpert repository.`
                }
            }
            return { available: true, manifest }
        } catch (error) {
            return { available: false, reason: messageOf(error) }
        }
    }

    /** Creates an isolated Job workspace view without claiming container-grade isolation. */
    async create(options: SandboxRuntimeCreateOptions): Promise<SandboxRuntimeInstance> {
        requireDevelopmentRuntime()
        if (!isLocalBinding(options.binding, options.definition.name)) {
            throw new Error('Local Browser Runtime received an incompatible Binding.')
        }
        const runtimeId = localRuntimeId(options.workFor.id)
        const existing = this.instances.get(runtimeId)
        if (existing) return existing

        const assets = await resolveLocalRuntimeAssets(options.definition)
        const workspaceRoot = path.resolve(options.volume.serverRoot)
        await mkdir(workspaceRoot, { recursive: true })
        await Promise.all(
            ['input', 'output', 'runtime'].map((directory) =>
                mkdir(path.join(workspaceRoot, directory), { recursive: true })
            )
        )
        for (const file of options.readOnlyFiles ?? []) {
            await exposeLocalReadOnlyFile(workspaceRoot, file)
        }
        const instance = new LocalBrowserRuntimeInstance({
            id: runtimeId,
            workspaceRoot: await realpath(workspaceRoot),
            runnerPath: assets.runnerPath,
            nodePath: assets.nodePath,
            environment: assets.environment,
            trustedCommand: options.definition.command,
            hardDeadlineMs: options.hardDeadlineMs
        })
        this.instances.set(runtimeId, instance)
        return instance
    }

    /** Idempotently terminates a live local process; persisted stale refs require no host cleanup. */
    async destroy(options: SandboxRuntimeDestroyOptions): Promise<void> {
        const runtimeId = options.runtimeRef ?? localRuntimeId(options.workFor.id)
        const instance = this.instances.get(runtimeId)
        if (!instance) return
        await instance.dispose()
        this.instances.delete(runtimeId)
    }
}

/**
 * Development-only copy-on-write mapping. A forced filesystem clone creates a
 * distinct read-only inode without eagerly copying media blocks, so the Action
 * can seek it without learning or mutating the original Workspace file.
 * Production relies on a hardened Provider bind mount instead.
 */
async function exposeLocalReadOnlyFile(workspaceRoot: string, file: SandboxRuntimeReadOnlyFile): Promise<void> {
    const source = await lstat(file.source.serverPath)
    if (
        !source.isFile() ||
        source.size !== file.source.size ||
        source.mtimeMs !== file.source.mtimeMs ||
        source.dev !== file.source.device ||
        source.ino !== file.source.inode ||
        source.size !== file.size
    ) {
        throw new Error(`Local Browser Runtime read-only input changed: ${file.targetPath}`)
    }
    const target = resolveWorkspaceFile(workspaceRoot, file.targetPath)
    await ensureSafeDirectory(workspaceRoot, path.dirname(target))
    const existing = await lstat(target).catch(() => null)
    if (existing?.isSymbolicLink() || (existing && !existing.isFile())) {
        throw invalidPathError('Runtime read-only input target is invalid.')
    }
    if (existing) await unlink(target)
    await cloneLocalFile(file.source.serverPath, target).catch((error) => {
        throw new Error(
            `Local Browser Runtime could not clone read-only input ${file.targetPath}; ` +
                `the Workspace and Job volume must share a clone-capable filesystem: ${error instanceof Error ? error.message : String(error)}`
        )
    })
    await chmod(target, 0o444)
}

async function cloneLocalFile(source: string, target: string): Promise<void> {
    const args =
        process.platform === 'darwin'
            ? ['-c', '--', source, target]
            : process.platform === 'linux'
              ? ['--reflink=always', '--', source, target]
              : null
    if (!args) throw new Error(`copy-on-write file cloning is unsupported on ${process.platform}`)
    await execFileAsync('cp', args, { windowsHide: true })
}

type LocalBrowserRuntimeInstanceOptions = {
    id: string
    workspaceRoot: string
    runnerPath: string
    nodePath: string
    environment: NodeJS.ProcessEnv
    trustedCommand: readonly string[]
    hardDeadlineMs: number
}

/** Runtime instance that confines file I/O and one fixed Runner process to a Job workspace. */
class LocalBrowserRuntimeInstance implements SandboxRuntimeInstance {
    readonly id: string
    readonly workspaceRoot: string

    private readonly runnerPath: string
    private readonly nodePath: string
    private readonly environment: NodeJS.ProcessEnv
    private readonly trustedCommand: readonly string[]
    private readonly hardDeadlineTimer: ReturnType<typeof setTimeout>
    private activeChild?: ChildProcessWithoutNullStreams
    private terminationReason?: SandboxRuntimeTerminationReason

    constructor(options: LocalBrowserRuntimeInstanceOptions) {
        this.id = options.id
        this.workspaceRoot = options.workspaceRoot
        this.runnerPath = options.runnerPath
        this.nodePath = options.nodePath
        this.environment = options.environment
        this.trustedCommand = options.trustedCommand
        this.hardDeadlineTimer = setTimeout(() => {
            this.terminationReason = 'deadline'
            this.killActiveChild()
        }, options.hardDeadlineMs)
        this.hardDeadlineTimer.unref()
    }

    /** Executes only the Definition command plus Core-owned, workspace-confined arguments. */
    async execute(
        argv: readonly string[],
        options: SandboxRuntimeExecutionOptions = {}
    ): Promise<SandboxRuntimeExecuteResponse> {
        requireDevelopmentRuntime()
        if (this.activeChild) throw new Error('Local Browser Runtime already has an active Runner process.')
        const runnerArgs = validateRunnerCommand(argv, this.trustedCommand, this.workspaceRoot)
        const timeoutMs = positiveInteger(options.timeoutMs, 300_000)
        const maxOutputBytes = positiveInteger(options.maxOutputBytes, DEFAULT_OUTPUT_LIMIT)

        return new Promise<SandboxRuntimeExecuteResponse>((resolve, reject) => {
            const child = spawn(this.nodePath, [this.runnerPath, ...runnerArgs], {
                cwd: this.workspaceRoot,
                env: this.environment,
                detached: process.platform !== 'win32',
                stdio: ['ignore', 'pipe', 'pipe']
            })
            this.activeChild = child
            let output = ''
            let truncated = false
            let timedOut = false
            const append = (stream: 'stdout' | 'stderr', chunk: Buffer | string) => {
                const text = String(chunk)
                const next = `${output}${String(chunk)}`
                if (Buffer.byteLength(next) <= maxOutputBytes) {
                    output = next
                } else {
                    truncated = true
                    output = Buffer.from(next).subarray(-maxOutputBytes).toString()
                }
                try {
                    options.onOutput?.({ stream, text })
                } catch {
                    // Output observers are diagnostic and must never fail execution.
                }
            }
            child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk))
            child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk))
            const timeout = setTimeout(() => {
                timedOut = true
                this.killActiveChild()
            }, timeoutMs)
            timeout.unref()

            child.once('error', (error) => {
                clearTimeout(timeout)
                if (this.activeChild === child) this.activeChild = undefined
                reject(error)
            })
            child.once('exit', (exitCode) => {
                clearTimeout(timeout)
                if (this.activeChild === child) this.activeChild = undefined
                resolve({
                    output: output.trim(),
                    exitCode,
                    truncated,
                    ...(timedOut ? { timedOut: true } : {}),
                    ...(this.terminationReason ? { terminationReason: this.terminationReason } : {})
                })
            })
        })
    }

    /** Writes regular files below this Job workspace and refuses link traversal. */
    async uploadFiles(files: Array<[string, Uint8Array]>): Promise<SandboxRuntimeFileUploadResponse[]> {
        const responses: SandboxRuntimeFileUploadResponse[] = []
        for (const [requestedPath, content] of files) {
            try {
                const target = resolveWorkspaceFile(this.workspaceRoot, requestedPath)
                await ensureSafeDirectory(this.workspaceRoot, path.dirname(target))
                await writeRegularFile(target, content)
                responses.push({ path: requestedPath, error: null })
            } catch (error) {
                responses.push({ path: requestedPath, error: fileOperationError(error) })
            }
        }
        return responses
    }

    /** Reads regular non-link files below this Job workspace. */
    async downloadFiles(paths: string[]): Promise<SandboxRuntimeFileDownloadResponse[]> {
        const responses: SandboxRuntimeFileDownloadResponse[] = []
        for (const requestedPath of paths) {
            try {
                const target = resolveWorkspaceFile(this.workspaceRoot, requestedPath)
                const stat = await lstat(target)
                if (stat.isSymbolicLink()) throw invalidPathError('Runtime output cannot be a symbolic link.')
                if (!stat.isFile()) throw isDirectoryError('Runtime output must be a regular file.')
                assertWithinWorkspace(this.workspaceRoot, await realpath(target), false)
                responses.push({ path: requestedPath, content: await readFile(target), error: null })
            } catch (error) {
                responses.push({ path: requestedPath, content: null, error: fileOperationError(error) })
            }
        }
        return responses
    }

    /** Best-effort cancellation for the Runner and its process group. */
    terminate(): void {
        if (!this.terminationReason) this.terminationReason = 'cancelled'
        this.killActiveChild()
    }

    async dispose(): Promise<void> {
        clearTimeout(this.hardDeadlineTimer)
        this.terminate()
        await waitForExit(this.activeChild, 2_000)
    }

    private killActiveChild(): void {
        const child = this.activeChild
        if (!child || child.exitCode !== null) return
        if (process.platform !== 'win32' && child.pid) {
            try {
                process.kill(-child.pid, 'SIGTERM')
            } catch {
                child.kill('SIGTERM')
            }
        } else {
            child.kill('SIGTERM')
        }
        const forceKill = setTimeout(() => {
            if (child.exitCode === null) child.kill('SIGKILL')
        }, 1_000)
        forceKill.unref()
    }
}

function localBrowserBinding(runtimeProfile: string, configuration: LocalRuntimeConfiguration): SandboxRuntimeBinding {
    return {
        id: configuration.bindingId,
        runtimeProfile,
        provider: LOCAL_BROWSER_RUNTIME_PROVIDER,
        priority: LOCAL_BINDING_PRIORITY,
        providerVersion: LOCAL_PROVIDER_VERSION,
        artifact: { kind: 'filesystem', reference: configuration.artifactReference },
        developmentOnly: true
    }
}

function isLocalBinding(binding: SandboxRuntimeBinding, runtimeProfile: string): boolean {
    const configuration = LOCAL_RUNTIME_CONFIGURATIONS[runtimeProfile]
    if (!configuration) return false
    return (
        binding.id === configuration.bindingId &&
        binding.provider === LOCAL_BROWSER_RUNTIME_PROVIDER &&
        binding.runtimeProfile === runtimeProfile &&
        binding.artifact.kind === 'filesystem' &&
        binding.artifact.reference === configuration.artifactReference &&
        binding.developmentOnly === true
    )
}

function localRuntimeConfiguration(runtimeProfile: string): LocalRuntimeConfiguration {
    const configuration = LOCAL_RUNTIME_CONFIGURATIONS[runtimeProfile]
    if (!configuration) throw new Error(`Local Browser Runtime does not support profile ${runtimeProfile}.`)
    return configuration
}

function requireDevelopmentRuntime(): void {
    if (!isDevelopmentSandboxRuntimeEnvironment()) {
        throw new Error('local-browser-runtime is forbidden outside development/test.')
    }
}

function localRuntimeId(jobId: string): string {
    return `${LOCAL_BROWSER_RUNTIME_PROVIDER}:${jobId}`
}

type LocalRuntimeAssets = {
    root: string
    runnerPath: string
    nodePath: string
    environment: NodeJS.ProcessEnv
}

async function resolveLocalRuntimeAssets(
    definition: SandboxRuntimeCreateOptions['definition']
): Promise<LocalRuntimeAssets> {
    const configuration = localRuntimeConfiguration(definition.name)
    const packageRoots = [
        path.resolve(process.cwd(), 'packages/sandbox-runtime'),
        path.resolve(__dirname, '../../../../sandbox-runtime')
    ]
    for (const packageRoot of packageRoots) {
        const root = path.join(packageRoot, 'images', configuration.imageFamily, 'runtime')
        const runnerPath = path.join(packageRoot, 'images', 'browser', 'runtime', 'runner-host.mjs')
        const manifestPath = path.join(root, 'manifest.json')
        try {
            await Promise.all([access(runnerPath, fsConstants.R_OK), access(manifestPath, fsConstants.R_OK)])
            const nodePath = await resolveNodeExecutable(definition.expectedManifest.nodeVersion)
            const environmentAdditions: NodeJS.ProcessEnv = {
                XPERT_SANDBOX_RUNTIME_MANIFEST_PATH: manifestPath
            }
            if (configuration.requiresFfmpeg) {
                const ffmpegPath = await resolveLocalFfmpeg(packageRoot)
                environmentAdditions.PATH = prependPath(path.dirname(ffmpegPath), process.env.PATH)
            }
            return {
                root,
                runnerPath,
                nodePath,
                environment: localRuntimeEnvironment(environmentAdditions)
            }
        } catch {
            // Try the next deterministic source-tree location.
        }
    }
    throw new Error(
        `Local Browser Runtime assets for ${definition.name} were not found or are incomplete. Run "${configuration.installCommand}" from the Xpert repository.`
    )
}

async function resolveLocalFfmpeg(packageRoot: string): Promise<string> {
    const candidates = [
        path.join(packageRoot, 'node_modules', 'ffmpeg-ffprobe-static', 'ffmpeg'),
        path.resolve(packageRoot, '../../node_modules/ffmpeg-ffprobe-static/ffmpeg')
    ]
    for (const candidate of candidates) {
        try {
            await access(candidate, fsConstants.X_OK)
            return candidate
        } catch {
            // Try the next pnpm layout.
        }
    }
    throw new Error(
        `Local Browser Video Runtime FFmpeg is not installed. Run "${LOCAL_VIDEO_INSTALL_COMMAND}" from the Xpert repository.`
    )
}

async function resolveNodeExecutable(expectedVersion: string | undefined): Promise<string> {
    if (!expectedVersion) throw new Error('Local Browser Runtime Definition does not declare nodeVersion.')
    const executableName = process.platform === 'win32' ? 'node.exe' : 'node'
    const nvmRoot = process.env.NVM_DIR ?? (process.env.HOME ? path.join(process.env.HOME, '.nvm') : undefined)
    const candidates = [
        process.execPath,
        ...(process.env.PATH ?? '').split(path.delimiter).map((directory) => path.join(directory, executableName)),
        ...(nvmRoot ? [path.join(nvmRoot, 'versions', 'node', `v${expectedVersion}`, 'bin', executableName)] : []),
        ...(process.env.HOME
            ? [path.join(process.env.HOME, '.volta', 'tools', 'image', 'node', expectedVersion, 'bin', executableName)]
            : [])
    ]
    for (const candidate of Array.from(new Set(candidates))) {
        try {
            await access(candidate, fsConstants.X_OK)
            const { stdout } = await execFileAsync(candidate, ['--version'], {
                timeout: 5_000,
                windowsHide: true
            })
            if (stdout.trim() === `v${expectedVersion}`) return candidate
        } catch {
            // Try the next installed Node executable.
        }
    }
    throw new Error(
        `Local Browser Runtime requires Node ${expectedVersion}. Install it with "nvm install ${expectedVersion}" and restart the API.`
    )
}

function prependPath(directory: string, currentPath: string | undefined): string {
    return currentPath ? `${directory}${path.delimiter}${currentPath}` : directory
}

function validateRunnerCommand(
    argv: readonly string[],
    trustedCommand: readonly string[],
    workspaceRoot: string
): string[] {
    if (argv.length !== trustedCommand.length + 8 || trustedCommand.some((value, index) => argv[index] !== value)) {
        throw new Error('Local Browser Runtime rejected an untrusted Runner command.')
    }
    const args = Array.from(argv.slice(trustedCommand.length))
    const expectedFlags = ['--request', '--output', '--action-root', '--action-manifest']
    for (let index = 0; index < expectedFlags.length; index += 1) {
        const offset = index * 2
        if (args[offset] !== expectedFlags[index] || !args[offset + 1]) {
            throw new Error('Local Browser Runtime rejected malformed Runner arguments.')
        }
        assertWithinWorkspace(workspaceRoot, path.resolve(args[offset + 1]), false)
    }
    return args
}

function resolveWorkspaceFile(workspaceRoot: string, requestedPath: string): string {
    if (!requestedPath || requestedPath.includes('\0')) throw invalidPathError('Runtime file path is invalid.')
    const target = path.isAbsolute(requestedPath)
        ? path.resolve(requestedPath)
        : path.resolve(workspaceRoot, requestedPath)
    assertWithinWorkspace(workspaceRoot, target, false)
    return target
}

function assertWithinWorkspace(workspaceRoot: string, candidate: string, allowRoot: boolean): void {
    const relative = path.relative(path.resolve(workspaceRoot), path.resolve(candidate))
    if (
        (!allowRoot && relative === '') ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
    ) {
        throw invalidPathError('Runtime path escapes the Job workspace.')
    }
}

async function ensureSafeDirectory(workspaceRoot: string, directory: string): Promise<void> {
    assertWithinWorkspace(workspaceRoot, directory, true)
    const relative = path.relative(workspaceRoot, directory)
    let current = workspaceRoot
    for (const segment of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment)
        await mkdir(current).catch((error) => {
            if (nodeErrorCode(error) !== 'EEXIST') throw error
        })
        const stat = await lstat(current)
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
            throw invalidPathError('Runtime workspace contains an unsafe directory component.')
        }
    }
}

async function writeRegularFile(target: string, content: Uint8Array): Promise<void> {
    const existing = await lstat(target).catch((error) => {
        if (nodeErrorCode(error) === 'ENOENT') return null
        throw error
    })
    if (existing?.isSymbolicLink() || existing?.isDirectory()) {
        throw invalidPathError('Runtime upload target must be a regular file.')
    }
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
    const handle = await open(
        target,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | noFollow,
        0o600
    )
    try {
        await handle.writeFile(content)
    } finally {
        await handle.close()
    }
}

function localRuntimeEnvironment(additions: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    const names = [
        'PATH',
        'HOME',
        'TMPDIR',
        'TMP',
        'TEMP',
        'XDG_CACHE_HOME',
        'PLAYWRIGHT_BROWSERS_PATH',
        'LANG',
        'LC_ALL',
        'TZ'
    ] as const
    return {
        ...Object.fromEntries(
            names.flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]]))
        ),
        ...additions
    }
}

async function runProcess(
    command: string,
    args: string[],
    options: { timeoutMs: number; maxOutputBytes: number; cwd: string; env: NodeJS.ProcessEnv }
): Promise<SandboxRuntimeExecuteResponse> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: options.env,
            stdio: ['ignore', 'pipe', 'pipe']
        })
        let output = ''
        let truncated = false
        const append = (chunk: Buffer | string) => {
            const next = `${output}${String(chunk)}`
            if (Buffer.byteLength(next) <= options.maxOutputBytes) output = next
            else {
                truncated = true
                output = Buffer.from(next).subarray(-options.maxOutputBytes).toString()
            }
        }
        child.stdout.on('data', append)
        child.stderr.on('data', append)
        const timeout = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs)
        timeout.unref()
        child.once('error', (error) => {
            clearTimeout(timeout)
            reject(error)
        })
        child.once('exit', (exitCode) => {
            clearTimeout(timeout)
            resolve({ output: output.trim(), exitCode, truncated })
        })
    })
}

function parseStringRecord(value: string, field: string): Record<string, string> {
    let parsed: unknown
    try {
        parsed = JSON.parse(value)
    } catch {
        throw new Error(`${field} is not valid JSON.`)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${field} must be an object.`)
    }
    const entries = Object.entries(parsed)
    if (entries.some(([, item]) => typeof item !== 'string')) {
        throw new Error(`${field} must contain string values only.`)
    }
    return Object.fromEntries(entries.map(([key, item]) => [key, String(item)]))
}

function manifestMismatch(expected: Record<string, string>, actual: Record<string, string>): string | null {
    for (const [key, value] of Object.entries(expected)) {
        if (actual[key] !== value) {
            return `Local Browser Runtime manifest mismatch for ${key}: expected ${value}, received ${actual[key] ?? 'missing'}.`
        }
    }
    return null
}

function fileOperationError(error: unknown): SandboxRuntimeFileOperationError {
    const code = nodeErrorCode(error)
    if (code === 'ENOENT') return 'file_not_found'
    if (code === 'EACCES' || code === 'EPERM') return 'permission_denied'
    if (code === 'EISDIR' || code === 'ENOTDIR') return 'is_directory'
    return 'invalid_path'
}

function invalidPathError(message: string): Error & { code: 'EINVAL' } {
    return Object.assign(new Error(message), { code: 'EINVAL' as const })
}

function isDirectoryError(message: string): Error & { code: 'EISDIR' } {
    return Object.assign(new Error(message), { code: 'EISDIR' as const })
}

function nodeErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object' || !('code' in error)) return undefined
    return typeof error.code === 'string' ? error.code : undefined
}

function positiveInteger(value: number | undefined, fallback: number): number {
    return Number.isFinite(value) && Number(value) > 0 ? Math.trunc(Number(value)) : fallback
}

function waitForExit(child: ChildProcessWithoutNullStreams | undefined, timeoutMs: number): Promise<void> {
    if (!child || child.exitCode !== null) return Promise.resolve()
    return new Promise((resolve) => {
        const timeout = setTimeout(resolve, timeoutMs)
        timeout.unref()
        child.once('exit', () => {
            clearTimeout(timeout)
            resolve()
        })
    })
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
