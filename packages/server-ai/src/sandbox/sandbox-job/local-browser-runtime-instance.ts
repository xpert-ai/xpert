// Invariants: one controlled execution per instance; only the supervisor proves descendant exit.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import {
    isDevelopmentSandboxRuntimeEnvironment,
    type SandboxRuntimeInstance,
    type SandboxRuntimeExecutionOptions,
    type SandboxRuntimeExecuteResponse,
    type SandboxRuntimeTerminationReason,
    type SandboxRuntimeFileUploadResponse,
    type SandboxRuntimeFileDownloadResponse
} from '@xpert-ai/plugin-sdk'
import { supervisedProcess } from './sandbox-supervised-process'
import {
    validateRunnerCommand,
    resolveWorkspaceFile,
    assertWithinWorkspace,
    ensureSafeDirectory,
    writeRegularFile,
    fileOperationError,
    invalidPathError,
    isDirectoryError
} from './local-browser-runtime-files'
const DEFAULT_OUTPUT_LIMIT = 4 * 1024 * 1024

type LocalBrowserRuntimeInstanceOptions = {
    controlled?: boolean
    id: string
    workspaceRoot: string
    runnerPath: string
    nodePath: string
    environment: NodeJS.ProcessEnv
    trustedCommand: readonly string[]
    hardDeadlineMs: number
}

/** Runtime instance that confines file I/O and one fixed Runner process to a Job workspace. */
export class LocalBrowserRuntimeInstance implements SandboxRuntimeInstance {
    readonly id: string
    readonly workspaceRoot: string

    private readonly runnerPath: string
    private readonly nodePath: string
    private readonly environment: NodeJS.ProcessEnv
    private readonly trustedCommand: readonly string[]
    private readonly hardDeadlineTimer: ReturnType<typeof setTimeout>
    private activeChild?: ChildProcessWithoutNullStreams
    private supervisor?: ReturnType<typeof supervisedProcess>
    private readonly controlled: boolean
    private executed = false
    exitProven = false
    executionUnknown = false
    private terminationReason?: SandboxRuntimeTerminationReason

    constructor(options: LocalBrowserRuntimeInstanceOptions) {
        this.controlled = !!options.controlled
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
        if (this.controlled && (this.executed || this.terminationReason))
            throw new Error('Sandbox execution admission closed')
        if (this.activeChild) throw new Error('Local Browser Runtime already has an active Runner process.')
        const runnerArgs = validateRunnerCommand(argv, this.trustedCommand, this.workspaceRoot)
        this.executed = true
        const timeoutMs = positiveInteger(options.timeoutMs, 300_000)
        const maxOutputBytes = positiveInteger(options.maxOutputBytes, DEFAULT_OUTPUT_LIMIT)

        return new Promise<SandboxRuntimeExecuteResponse>((resolve, reject) => {
            this.supervisor = this.controlled
                ? supervisedProcess(
                      this.nodePath,
                      [this.runnerPath, ...runnerArgs],
                      this.workspaceRoot,
                      this.environment
                  )
                : undefined
            const child =
                this.supervisor?.child ??
                spawn(this.nodePath, [this.runnerPath, ...runnerArgs], {
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
            child.once('close', async (exitCode) => {
                const receipt = await this.supervisor?.finished
                if (this.controlled) {
                    this.exitProven = !!receipt
                    this.executionUnknown = !receipt
                }
                clearTimeout(timeout)
                if (this.activeChild === child) this.activeChild = undefined
                resolve({
                    output: output.trim(),
                    exitCode: receipt ? receipt.exitCode : exitCode,
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
        if (this.controlled && !this.executed) this.exitProven = true
        this.killActiveChild()
    }

    async dispose(): Promise<void> {
        clearTimeout(this.hardDeadlineTimer)
        this.terminate()
        await waitForExit(this.activeChild, 2_000)
    }

    private killActiveChild(): void {
        if (this.supervisor) {
            this.supervisor.stop()
            return
        }
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

export function requireDevelopmentRuntime(): void {
    if (!isDevelopmentSandboxRuntimeEnvironment()) {
        throw new Error('local-browser-runtime is forbidden outside development/test.')
    }
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
