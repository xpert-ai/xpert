import cp from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { Injectable } from '@nestjs/common'
import {
  appendSandboxMessage,
  BaseSandbox,
  buildSandboxTimeoutMessage,
  DEFAULT_SANDBOX_SHELL_EXECUTION_OPTIONS,
  ExecuteResponse,
  FileDownloadResponse,
  FileUploadResponse,
  ISandboxProvider,
  SandboxManagedServiceAdapter,
  SandboxManagedServiceListOptions,
  SandboxManagedServiceListResult,
  SandboxManagedServiceLogsOptions,
  SandboxManagedServiceRestartOptions,
  SandboxManagedServiceStartOptions,
  SandboxManagedServiceStartResult,
  SandboxManagedServiceStateChange,
  SandboxManagedServiceStopOptions,
  resolveSandboxExecutionOptions,
  SandboxServiceProxyAdapter,
  SandboxServiceProxyRequest,
  SandboxExecutionOptions,
  SandboxProviderCreateOptions,
  SandboxProviderStrategy
} from '@xpert-ai/plugin-sdk'
import type { SandboxTerminalAdapter, SandboxTerminalOpenOptions, SandboxTerminalSession } from '@xpert-ai/plugin-sdk'
import type {
  ISandboxManagedService,
  TSandboxManagedServiceEnvEntry,
  TSandboxManagedServiceLogs,
  TSandboxProviderMeta
} from '@xpert-ai/contracts'
import type { IPty } from 'node-pty'

const LOCAL_SHELL_SANDBOX_PROVIDER = 'local-shell-sandbox'
const DEFAULT_TERMINAL_COLS = 120
const DEFAULT_TERMINAL_ROWS = 32
const TERMINAL_BASH_ARGS = ['--noprofile', '--norc']
const ANSI_ESCAPE = '\u001b'
const ANSI_NON_PRINTING_PREFIX = '\u0001'
const ANSI_NON_PRINTING_SUFFIX = '\u0002'
const TERMINAL_PROMPT = `${ANSI_NON_PRINTING_PREFIX}${ANSI_ESCAPE}[1;36m${ANSI_NON_PRINTING_SUFFIX}xpert@sandbox${ANSI_NON_PRINTING_PREFIX}${ANSI_ESCAPE}[0m${ANSI_NON_PRINTING_SUFFIX} ${ANSI_NON_PRINTING_PREFIX}${ANSI_ESCAPE}[33m${ANSI_NON_PRINTING_SUFFIX}\\w${ANSI_NON_PRINTING_PREFIX}${ANSI_ESCAPE}[0m${ANSI_NON_PRINTING_SUFFIX} $ `
const TERMINAL_ZSH_PROMPT = '%F{cyan}xpert@sandbox%f %F{yellow}%~%f $ '
const TERMINAL_LS_COLORS = 'ExFxCxDxBxegedabagacad'
const LOCAL_SHELL_SANDBOX_ICON = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generator: Adobe Illustrator 19.2.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg version="1.1" id="Layer_1" xmlns:x="&ns_extend;" xmlns:i="&ns_ai;" xmlns:graph="&ns_graphs;"
	 xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512"
	 style="enable-background:new 0 0 512 512;" xml:space="preserve">
<style type="text/css">
	.Drop_x0020_Shadow{fill:none;}
	.Round_x0020_Corners_x0020_2_x0020_pt{fill:#FFFFFF;stroke:#1B1B1F;stroke-miterlimit:10;}
	.Live_x0020_Reflect_x0020_X{fill:none;}
	.Bevel_x0020_Soft{fill:url(#SVGID_1_);}
	.Dusk{fill:#FFFFFF;}
	.Foliage_GS{fill:#FFDC00;}
	.Pompadour_GS{fill-rule:evenodd;clip-rule:evenodd;fill:#58AEE2;}
	.st0{fill:none;}
	.st1{fill:#FFFFFF;}
	.st2{fill:#283037;}
	.st3{fill:#4DA825;}
</style>
<switch>
	<foreignObject requiredExtensions="&ns_ai;" x="0" y="0" width="1" height="1">
		<i:pgfRef  xlink:href="#adobe_illustrator_pgf">
		</i:pgfRef>
	</foreignObject>
	<g i:extraneous="self">
		<linearGradient id="SVGID_1_" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0.7071" y2="0.7071">
			<stop  offset="0" style="stop-color:#E6E6EA"/>
			<stop  offset="0.1719" style="stop-color:#E2E2E6"/>
			<stop  offset="0.3482" style="stop-color:#D7D6DA"/>
			<stop  offset="0.5264" style="stop-color:#C4C2C5"/>
			<stop  offset="0.7061" style="stop-color:#A9A7A8"/>
			<stop  offset="0.8852" style="stop-color:#878484"/>
			<stop  offset="1" style="stop-color:#6D6968"/>
		</linearGradient>
		<g>
			<rect x="0.3" y="1.3" class="st0" width="512" height="512"/>
			<g>
				<g>
					<path class="st1" d="M449.1,105.9L287.5,9.9c-19.3-11.5-43.1-11.5-62.4,0L63.5,105.9c-19.3,11.4-31.2,32.6-31.2,55.5v191.9
						c0,22.9,11.9,44.1,31.2,55.5l161.6,95.9c9.6,5.7,20.4,8.6,31.2,8.6c10.8,0,21.5-2.9,31.2-8.6l161.6-95.9
						c19.3-11.5,31.2-32.6,31.2-55.5V161.4C480.3,138.5,468.4,117.3,449.1,105.9z"/>
				</g>
				<g>
					<path class="st2" d="M449.1,105.9L287.5,9.9c-9.6-5.7-20.4-8.6-31.2-8.6s-21.5,2.9-31.2,8.6L63.5,105.9
						c-19.3,11.4-31.2,32.6-31.2,55.5v191.9c0,22.9,11.9,44.1,31.2,55.5l161.6,95.9c9.6,5.7,20.4,8.6,31.2,8.6
						c10.8,0,21.5-2.9,31.2-8.6l161.6-95.9c19.3-11.5,31.2-32.6,31.2-55.5V161.4C480.3,138.5,468.4,117.3,449.1,105.9z M230.8,494.9
						L69.2,399c-15.8-9.4-25.6-26.9-25.6-45.7V161.4c0-18.8,9.8-36.3,25.6-45.7l161.6-95.9c7.8-4.6,16.6-7,25.5-7s17.8,2.4,25.5,7
						l161.6,95.9c13.3,7.9,22.3,21.6,24.8,37c-5.4-11.4-17.4-14.6-31.5-6.3l-152.9,94.5c-19.1,11.1-33.1,23.7-33.1,46.6v188.4
						c0,13.8,5.5,22.7,14.1,25.3c-2.8,0.5-5.6,0.8-8.5,0.8C247.4,501.9,238.5,499.5,230.8,494.9z"/>
				</g>
				<g>
					<path class="st3" d="M406.8,371.8l-40.3,24.1c-1.1,0.6-1.9,1.3-1.9,2.6v10.5c0,1.3,0.9,1.8,1.9,1.2l40.9-24.8
						c1.1-0.6,1.2-1.8,1.2-3.1V373C408.7,371.7,407.8,371.2,406.8,371.8z"/>
				</g>
				<g>
					<path class="st1" d="M321.1,283.2c1.3-0.7,2.4,0.2,2.4,1.9l0.1,13.9c5.8-2.3,10.9-2.9,15.5-1.9c1,0.3,1.4,1.6,1,3.2l-3.1,12.3
						c-0.2,0.9-0.8,1.9-1.4,2.5c-0.3,0.3-0.5,0.5-0.8,0.6c-0.4,0.2-0.8,0.3-1.2,0.2c-2.1-0.5-7.1-1.6-14.9,2.4
						c-8.2,4.2-11.1,11.3-11,16.6c0.1,6.3,3.3,8.3,14.5,8.4c14.9,0.2,21.4,6.8,21.5,21.8c0.2,14.8-7.7,30.6-19.8,40.4l0.3,13.8
						c0,1.7-1.1,3.6-2.4,4.2l-8.2,4.7c-1.3,0.7-2.4-0.1-2.4-1.8l-0.1-13.6c-7,2.9-14.1,3.6-18.6,1.8c-0.9-0.3-1.2-1.6-0.9-3l3-12.5
						c0.2-1,0.8-2,1.5-2.6c0.3-0.2,0.5-0.4,0.8-0.6c0.5-0.2,0.9-0.3,1.3-0.1c4.9,1.6,11.1,0.9,17.1-2.2c7.6-3.9,12.7-11.6,12.6-19.4
						c-0.1-7-3.9-9.9-13.1-10c-11.7,0-22.7-2.3-22.9-19.6c-0.1-14.2,7.3-29,19-38.4l-0.1-13.9c0-1.7,1-3.6,2.4-4.3L321.1,283.2z"/>
				</g>
			</g>
		</g>
		<g>
		</g>
		<g>
		</g>
		<g>
		</g>
		<g>
		</g>
		<g>
		</g>
		<g>
		</g>
	</g>
</switch>
</svg>
`

type ShellLaunchConfig = {
  args: string[]
  file: string
}

type NodePtyModule = Pick<typeof import('node-pty'), 'spawn'>

type ManagedServiceLogPaths = {
  stderrPath: string
  stdoutPath: string
}

type ManagedServiceMetadataCandidate = {
  logs?: {
    stderrPath?: unknown
    stdoutPath?: unknown
  }
}

type LocalManagedServiceRecord = {
  actualPort?: number | null
  child: cp.ChildProcess
  cwd: string
  exitPromise: Promise<SandboxManagedServiceStateChange>
  logPaths: ManagedServiceLogPaths
  requestedPort?: number | null
  resolveExit: (change: SandboxManagedServiceStateChange) => void
  status: SandboxManagedServiceStateChange
}

let cachedNodePtyModule: NodePtyModule | null = null

function buildNodePtyLoadError(error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error)
  return new Error(
    `Failed to load terminal support dependency "node-pty". Install or rebuild it for ${process.platform}-${process.arch}. ` +
      `In Docker images, ensure python3, make, and g++ are available during pnpm install. Original error: ${detail}`
  )
}

function getNodePtyModule(): NodePtyModule {
  if (cachedNodePtyModule) {
    return cachedNodePtyModule
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require('node-pty') as NodePtyModule
    if (typeof module.spawn !== 'function') {
      throw new Error('node-pty did not export a spawn function.')
    }
    cachedNodePtyModule = module
    return module
  } catch (error) {
    throw buildNodePtyLoadError(error)
  }
}

function tryEnsureNodePtySpawnHelperExecutable(): void {
  try {
    const packageRoot = path.dirname(require.resolve('node-pty/package.json'))
    const helperCandidates = [
      path.join(packageRoot, 'build', 'Release', 'spawn-helper'),
      path.join(packageRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper')
    ]

    for (const helperPath of helperCandidates) {
      if (!fs.existsSync(helperPath)) {
        continue
      }

      if ((fs.statSync(helperPath).mode & 0o111) === 0) {
        fs.chmodSync(helperPath, 0o755)
      }
      return
    }
  } catch {
    // If discovery fails we still attempt to open the PTY normally.
  }
}

function clampTerminalSize(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.max(1, Math.trunc(value)) : fallback
}

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeServiceEnv(entries: TSandboxManagedServiceEnvEntry[] | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}

  for (const entry of entries ?? []) {
    if (!entry.name.trim()) {
      continue
    }

    env[entry.name] = entry.value
  }

  return env
}

function isProcessMissingError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ESRCH'
}

function killProcessGroup(processId: number | undefined, signal: NodeJS.Signals): void {
  if (!processId) {
    return
  }

  if (process.platform === 'win32') {
    process.kill(processId, signal)
    return
  }

  process.kill(-processId, signal)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function resolveServiceLogPaths(
  metadata: ISandboxManagedService['metadata'],
  cwd: string,
  serviceId: string
): ManagedServiceLogPaths {
  if (isObjectLike(metadata)) {
    const candidate = metadata as ManagedServiceMetadataCandidate
    if (isObjectLike(candidate.logs)) {
      const { stdoutPath, stderrPath } = candidate.logs
      if (isNonEmptyString(stdoutPath) && isNonEmptyString(stderrPath)) {
        return { stdoutPath, stderrPath }
      }
    }
  }

  const basePath = path.join(cwd, '.xpert', 'managed-services', serviceId)
  return {
    stdoutPath: path.join(basePath, 'stdout.log'),
    stderrPath: path.join(basePath, 'stderr.log')
  }
}

function ensureServiceLogDirectory(logPaths: ManagedServiceLogPaths): void {
  fs.mkdirSync(path.dirname(logPaths.stdoutPath), { recursive: true })
  fs.mkdirSync(path.dirname(logPaths.stderrPath), { recursive: true })
}

function readLogTail(filePath: string, maxLines: number): string {
  if (!fs.existsSync(filePath)) {
    return ''
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/)
  return lines.slice(Math.max(0, lines.length - maxLines)).join('\n').trim()
}

function doesServiceLogMatch(logPaths: ManagedServiceLogPaths, readyPattern: RegExp): boolean {
  return readyPattern.test(`${readLogTail(logPaths.stdoutPath, 200)}\n${readLogTail(logPaths.stderrPath, 200)}`)
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`Timed out while waiting for port ${port}`))
    }, timeoutMs)

    socket.once('connect', () => {
      clearTimeout(timer)
      socket.end()
      resolve()
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      socket.destroy()
      reject(error)
    })
  })
}

function ensurePortIsAvailable(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()

    server.once('error', (error) => {
      server.close()
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use.`))
        return
      }
      reject(error)
    })

    server.listen(port, '127.0.0.1', () => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  })
}

function resolveFallbackShell(): ShellLaunchConfig {
  const shell = process.env['SHELL']?.trim()
  if (shell) {
    const shellName = path.basename(shell)
    if (shellName === 'bash') {
      return { file: shell, args: [...TERMINAL_BASH_ARGS] }
    }
    if (shellName === 'zsh') {
      return { file: shell, args: ['-f'] }
    }
    if (shellName === 'fish') {
      return { file: shell, args: ['--no-config'] }
    }
    return { file: shell, args: [] }
  }

  return { file: '/bin/sh', args: [] }
}

function resolveTerminalShell(): ShellLaunchConfig {
  if (fs.existsSync('/bin/bash')) {
    return {
      file: '/bin/bash',
      args: [...TERMINAL_BASH_ARGS]
    }
  }

  return resolveFallbackShell()
}

class LocalShellTerminalSession implements SandboxTerminalSession {
  constructor(private readonly ptyProcess: IPty) {}

  write(data: string): void {
    this.ptyProcess.write(data)
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(
      clampTerminalSize(cols, DEFAULT_TERMINAL_COLS),
      clampTerminalSize(rows, DEFAULT_TERMINAL_ROWS)
    )
  }

  close(): void {
    this.ptyProcess.kill()
  }
}

/**
 * LocalShellSandbox - A concrete sandbox implementation for local shell execution.
 *
 * Extends BaseSandbox to provide command execution in a specified working directory.
 * All file operations (read, write, ls, grep, glob) are automatically implemented
 * by BaseSandbox using shell commands, so we only need to implement:
 * - execute(): Run shell commands
 * - uploadFiles(): Write files to the sandbox
 * - downloadFiles(): Read files from the sandbox
 */
export class LocalShellSandbox
  extends BaseSandbox
  implements SandboxManagedServiceAdapter, SandboxServiceProxyAdapter, SandboxTerminalAdapter
{
  readonly id: string
  private readonly managedServices = new Map<string, LocalManagedServiceRecord>()

  /**
   * Create a new LocalShellSandbox.
   *
   * @param options - Configuration options
   * @param options.workingDirectory - Directory where commands will be executed
   */
  constructor(options: { workingDirectory: string }) {
    super()
    this.workingDirectory = path.resolve(options.workingDirectory)
    this.id = `local-shell-${this.workingDirectory.replace(/[^a-zA-Z0-9]/g, '-')}`

    // Ensure working directory exists
    if (!fs.existsSync(this.workingDirectory)) {
      fs.mkdirSync(this.workingDirectory, { recursive: true })
    }
  }

  /**
   * Execute a shell command in the sandbox.
   *
   * Uses /bin/bash to run commands with proper shell interpretation.
   * Captures both stdout and stderr, respects timeout.
   */
  async execute(command: string, options?: SandboxExecutionOptions): Promise<ExecuteResponse> {
    return this.runCommand(command, undefined, options)
  }

  override async streamExecute(
    command: string,
    onLine: (line: string) => void,
    options?: SandboxExecutionOptions
  ): Promise<ExecuteResponse> {
    return this.runCommand(command, onLine, options)
  }

  async open(options: SandboxTerminalOpenOptions): Promise<SandboxTerminalSession> {
    tryEnsureNodePtySpawnHelperExecutable()
    const { spawn } = getNodePtyModule()
    const shell = resolveTerminalShell()
    const ptyProcess = spawn(shell.file, shell.args, {
      cwd: this.workingDirectory,
      cols: clampTerminalSize(options.cols, DEFAULT_TERMINAL_COLS),
      rows: clampTerminalSize(options.rows, DEFAULT_TERMINAL_ROWS),
      env: {
        ...process.env,
        HOME: process.env['HOME'] ?? os.homedir(),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '1',
        CLICOLOR: '1',
        LSCOLORS: TERMINAL_LS_COLORS,
        BASH_ENV: '',
        ENV: '',
        PS1: TERMINAL_PROMPT,
        PROMPT: TERMINAL_ZSH_PROMPT,
        ZDOTDIR: '/dev/null'
      },
      name: 'xterm-256color'
    })

    ptyProcess.onData((data) => {
      options.onOutput(data)
    })
    ptyProcess.onExit((event) => {
      options.onExit({
        exitCode: event.exitCode,
        signal: event.signal
      })
    })

    return new LocalShellTerminalSession(ptyProcess)
  }

  async startService(options: SandboxManagedServiceStartOptions): Promise<SandboxManagedServiceStartResult> {
    const cwd = path.resolve(options.cwd || this.workingDirectory)
    if (options.port) {
      await ensurePortIsAvailable(options.port)
    }

    const logPaths = resolveServiceLogPaths(options.metadata, cwd, options.serviceId)
    ensureServiceLogDirectory(logPaths)

    const stdoutFd = fs.openSync(logPaths.stdoutPath, 'a')
    const stderrFd = fs.openSync(logPaths.stderrPath, 'a')

    const env = {
      ...process.env,
      HOME: process.env['HOME'] ?? os.homedir(),
      ...normalizeServiceEnv(options.env)
    }

    const child = cp.spawn('/bin/bash', ['-c', options.command], {
      cwd,
      detached: process.platform !== 'win32',
      env,
      stdio: ['ignore', stdoutFd, stderrFd]
    })
    fs.closeSync(stdoutFd)
    fs.closeSync(stderrFd)

    const initialState: SandboxManagedServiceStateChange = {
      actualPort: options.port ?? null,
      runtimeRef: child.pid
        ? {
            pid: child.pid,
            pgid: child.pid
          }
        : null,
      startedAt: new Date(),
      status: 'starting',
      stoppedAt: null,
      transportMode: options.port ? 'http' : 'none'
    }

    let resolveExitPromise: ((change: SandboxManagedServiceStateChange) => void) | null = null
    const exitPromise = new Promise<SandboxManagedServiceStateChange>((resolve) => {
      resolveExitPromise = resolve
    })

    let exitResolved = false

    const record: LocalManagedServiceRecord = {
      actualPort: options.port ?? null,
      child,
      cwd,
      exitPromise,
      logPaths,
      requestedPort: options.port ?? null,
      resolveExit: (change: SandboxManagedServiceStateChange) => {
        if (exitResolved) {
          return
        }
        exitResolved = true
        record.status = change
        this.managedServices.delete(options.serviceId)
        void options.onStateChange?.(change)
        resolveExitPromise?.(change)
      },
      status: initialState
    }
    this.managedServices.set(options.serviceId, record)

    child.once('error', (error) => {
      record.resolveExit({
        actualPort: options.port ?? null,
        exitCode: 1,
        runtimeRef: initialState.runtimeRef,
        signal: null,
        status: 'failed',
        stoppedAt: new Date(),
        transportMode: initialState.transportMode
      })
      fs.appendFileSync(logPaths.stderrPath, `${error.message}\n`)
    })
    child.once('exit', (exitCode, signal) => {
      record.resolveExit({
        actualPort: options.port ?? null,
        exitCode,
        runtimeRef: initialState.runtimeRef,
        signal,
        status: exitCode === 0 || record.status.status === 'stopping' ? 'stopped' : 'failed',
        stoppedAt: new Date(),
        transportMode: initialState.transportMode
      })
    })

    child.unref()
    await options.onStateChange?.(initialState)

    try {
      await this.waitForServiceReady({
        logPaths,
        port: options.port ?? null,
        processId: child.pid,
        readyPattern: options.readyPattern ?? null
      })
    } catch (error) {
      try {
        killProcessGroup(child.pid, 'SIGTERM')
      } catch (killError) {
        if (!isProcessMissingError(killError)) {
          throw killError
        }
      }
      await exitPromise
      throw error
    }

    const runningState: SandboxManagedServiceStateChange = {
      actualPort: options.port ?? null,
      runtimeRef: initialState.runtimeRef,
      startedAt: initialState.startedAt,
      status: 'running',
      stoppedAt: null,
      transportMode: initialState.transportMode
    }
    const managedRecord = this.managedServices.get(options.serviceId)
    if (managedRecord) {
      managedRecord.status = runningState
      managedRecord.actualPort = options.port ?? null
    }
    await options.onStateChange?.(runningState)

    return runningState
  }

  async listServices(options: SandboxManagedServiceListOptions): Promise<SandboxManagedServiceListResult> {
    const services = options.services.map((service) => {
      const managedService = service.id ? this.managedServices.get(service.id) : null
      if (managedService) {
        return {
          ...service,
          actualPort: managedService.actualPort ?? service.actualPort ?? null,
          runtimeRef: managedService.status.runtimeRef ?? service.runtimeRef ?? null,
          startedAt: managedService.status.startedAt ?? service.startedAt ?? null,
          status: managedService.status.status,
          stoppedAt: managedService.status.stoppedAt ?? service.stoppedAt ?? null,
          transportMode: managedService.status.transportMode ?? service.transportMode ?? null
        }
      }

      if (service.status === 'running' || service.status === 'starting' || service.status === 'stopping') {
        return {
          ...service,
          status: 'lost' as const
        }
      }

      return service
    })

    return { services }
  }

  async getServiceLogs(options: SandboxManagedServiceLogsOptions): Promise<TSandboxManagedServiceLogs> {
    const tail = options.tail && options.tail > 0 ? Math.trunc(options.tail) : 200
    const logPaths = resolveServiceLogPaths(
      options.service.metadata,
      options.service.workingDirectory || this.workingDirectory,
      options.service.id ?? 'service'
    )

    return {
      stderr: readLogTail(logPaths.stderrPath, tail),
      stdout: readLogTail(logPaths.stdoutPath, tail)
    }
  }

  async stopService(options: SandboxManagedServiceStopOptions): Promise<SandboxManagedServiceStateChange> {
    const serviceId = options.service.id
    if (!serviceId) {
      return {
        status: 'stopped',
        stoppedAt: new Date()
      }
    }

    const managedService = this.managedServices.get(serviceId)
    if (!managedService) {
      const lostState: SandboxManagedServiceStateChange = {
        actualPort: options.service.actualPort ?? null,
        runtimeRef: options.service.runtimeRef ?? null,
        status: options.service.status === 'failed' ? 'failed' : 'lost',
        stoppedAt: new Date(),
        transportMode: options.service.transportMode ?? null
      }
      await options.onStateChange?.(lostState)
      return lostState
    }

    const stoppingState: SandboxManagedServiceStateChange = {
      actualPort: managedService.actualPort ?? null,
      runtimeRef: managedService.status.runtimeRef ?? null,
      status: 'stopping',
      stoppedAt: null,
      transportMode: managedService.status.transportMode ?? null
    }
    managedService.status = stoppingState
    await options.onStateChange?.(stoppingState)

    try {
      killProcessGroup(managedService.child.pid, 'SIGTERM')
    } catch (error) {
      if (!isProcessMissingError(error)) {
        throw error
      }
    }

    const timeoutPromise = sleep(5000).then(() => {
      try {
        killProcessGroup(managedService.child.pid, 'SIGKILL')
      } catch (error) {
        if (!isProcessMissingError(error)) {
          throw error
        }
      }
      return managedService.exitPromise
    })

    return Promise.race([managedService.exitPromise, timeoutPromise.then((result) => result)])
  }

  async restartService(options: SandboxManagedServiceRestartOptions): Promise<SandboxManagedServiceStartResult> {
    await this.stopService({
      onStateChange: options.onStateChange,
      service: options.service
    })

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
    const serviceId = request.service.id
    const managedService = serviceId ? this.managedServices.get(serviceId) : null
    if (!managedService || managedService.status.status !== 'running') {
      request.response.statusCode = 502
      request.response.setHeader('content-type', 'text/plain; charset=utf-8')
      request.response.end('The selected sandbox service is not running.')
      return
    }

    const port = managedService.actualPort ?? managedService.requestedPort
    if (!isFiniteNumber(port) || port <= 0) {
      request.response.statusCode = 502
      request.response.setHeader('content-type', 'text/plain; charset=utf-8')
      request.response.end('The selected sandbox service does not expose an HTTP port.')
      return
    }

    const headers = { ...request.request.headers }
    delete headers.connection
    delete headers['keep-alive']
    delete headers['proxy-authenticate']
    delete headers['proxy-authorization']
    delete headers.te
    delete headers.trailer
    delete headers['transfer-encoding']
    delete headers.upgrade
    headers.host = `127.0.0.1:${port}`

    await new Promise<void>((resolve) => {
      const upstream = http.request(
        {
          headers,
          host: '127.0.0.1',
          method: request.request.method,
          path: request.path,
          port
        },
        (upstreamResponse) => {
          request.response.statusCode = upstreamResponse.statusCode ?? 502
          for (const [name, value] of Object.entries(upstreamResponse.headers)) {
            if (
              value !== undefined &&
              name !== 'connection' &&
              name !== 'keep-alive' &&
              name !== 'proxy-authenticate' &&
              name !== 'proxy-authorization' &&
              name !== 'te' &&
              name !== 'trailer' &&
              name !== 'transfer-encoding' &&
              name !== 'upgrade'
            ) {
              request.response.setHeader(name, value)
            }
          }
          upstreamResponse.pipe(request.response)
          upstreamResponse.on('end', () => resolve())
        }
      )

      upstream.on('error', (error) => {
        if (!request.response.headersSent) {
          request.response.statusCode = 502
          request.response.setHeader('content-type', 'text/plain; charset=utf-8')
        }
        request.response.end(`Failed to proxy sandbox service request: ${error.message}`)
        resolve()
      })

      if (request.request.readableEnded || request.request.method === 'GET' || request.request.method === 'HEAD') {
        upstream.end()
      } else {
        request.request.pipe(upstream)
      }
    })
  }

  private async waitForServiceReady(params: {
    logPaths: ManagedServiceLogPaths
    port?: number | null
    processId?: number
    readyPattern?: string | null
  }): Promise<void> {
    const readyRegex = isNonEmptyString(params.readyPattern) ? new RegExp(params.readyPattern) : null
    const deadline = Date.now() + 30_000

    while (Date.now() < deadline) {
      if (params.port) {
        try {
          await waitForPort(params.port, 300)
          return
        } catch {
          // Continue polling.
        }
      }

      if (readyRegex && doesServiceLogMatch(params.logPaths, readyRegex)) {
        return
      }

      if (!params.port && !readyRegex) {
        await sleep(300)
        if (params.processId) {
          try {
            process.kill(params.processId, 0)
          } catch (error) {
            if (isProcessMissingError(error)) {
              throw new Error('The sandbox service exited before it became ready.')
            }
            throw error
          }
        }
        return
      }

      if (params.processId) {
        try {
          process.kill(params.processId, 0)
        } catch (error) {
          if (isProcessMissingError(error)) {
            throw new Error('The sandbox service exited before it became ready.')
          }
          throw error
        }
      }

      await sleep(250)
    }

    throw new Error('Timed out while waiting for the sandbox service to become ready.')
  }

  private runCommand(
    command: string,
    onChunk?: (line: string) => void,
    executionOptions?: SandboxExecutionOptions
  ): Promise<ExecuteResponse> {
    return new Promise((resolve) => {
      const resolvedOptions = resolveSandboxExecutionOptions(executionOptions, DEFAULT_SANDBOX_SHELL_EXECUTION_OPTIONS)
      const chunks: string[] = []
      let truncated = false
      let totalBytes = 0
      let lineBuffer = ''
      let settled = false
      let timedOut = false
      let forceKillTimer: NodeJS.Timeout | null = null

      const child = cp.spawn('/bin/bash', ['-c', command], {
        cwd: this.workingDirectory,
        env: { ...process.env, HOME: process.env['HOME'] },
        detached: process.platform !== 'win32'
      })

      const timeoutMessage = buildSandboxTimeoutMessage('Command', resolvedOptions.timeoutMs)

      const buildTimeoutResponse = (): ExecuteResponse => ({
        output: appendSandboxMessage(chunks.join(''), timeoutMessage),
        exitCode: null,
        truncated,
        timedOut: true
      })

      const collectOutput = (data: Buffer) => {
        const str = data.toString()
        totalBytes += data.byteLength

        if (totalBytes <= resolvedOptions.maxOutputBytes) {
          chunks.push(str)
        } else {
          truncated = true
        }

        if (onChunk) {
          lineBuffer += str.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          const lines = lineBuffer.split('\n')
          lineBuffer = lines.pop() ?? ''
          for (const line of lines) {
            onChunk(line)
          }
        }
      }

      const finalize = (response: ExecuteResponse) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        if (forceKillTimer) {
          clearTimeout(forceKillTimer)
        }
        if (onChunk && lineBuffer) {
          onChunk(lineBuffer)
          lineBuffer = ''
        }
        resolve(response)
      }

      const killChild = (signal: NodeJS.Signals) => {
        if (!child.pid) {
          return
        }

        try {
          if (process.platform !== 'win32') {
            process.kill(-child.pid, signal)
          } else {
            child.kill(signal)
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
            finalize({
              output: `Error terminating process: ${(error as Error).message}`,
              exitCode: 1,
              truncated: false
            })
          }
        }
      }

      child.stdout.on('data', collectOutput)
      child.stderr.on('data', collectOutput)

      const timer = setTimeout(() => {
        timedOut = true
        killChild('SIGTERM')
        forceKillTimer = setTimeout(() => {
          killChild('SIGKILL')
        }, 5000)
      }, resolvedOptions.timeoutMs)

      child.on('close', (exitCode) => {
        if (forceKillTimer) {
          clearTimeout(forceKillTimer)
        }
        finalize(
          timedOut
            ? buildTimeoutResponse()
            : {
                output: chunks.join(''),
                exitCode,
                truncated,
                timedOut: false
              }
        )
      })

      child.on('error', (err) => {
        if (forceKillTimer) {
          clearTimeout(forceKillTimer)
        }
        finalize(
          timedOut
            ? buildTimeoutResponse()
            : {
                output: `Error spawning process: ${err.message}`,
                exitCode: 1,
                truncated: false
              }
        )
      })
    })
  }

  /**
   * Upload files to the sandbox.
   *
   * Writes files to the working directory, creating parent directories as needed.
   */
  async uploadFiles(files: Array<[string, Uint8Array]>): Promise<FileUploadResponse[]> {
    const results: FileUploadResponse[] = []

    for (const [filePath, content] of files) {
      try {
        const fullPath = path.join(this.workingDirectory, filePath)
        const parentDir = path.dirname(fullPath)

        // Ensure parent directory exists
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true })
        }

        fs.writeFileSync(fullPath, content)
        results.push({ path: filePath, error: null })
      } catch (err) {
        const error = err as NodeJS.ErrnoException
        if (error.code === 'EACCES') {
          results.push({ path: filePath, error: 'permission_denied' })
        } else if (error.code === 'EISDIR') {
          results.push({ path: filePath, error: 'is_directory' })
        } else {
          results.push({ path: filePath, error: 'invalid_path' })
        }
      }
    }

    return results
  }

  /**
   * Download files from the sandbox.
   *
   * Reads files from the working directory.
   */
  async downloadFiles(paths: string[]): Promise<FileDownloadResponse[]> {
    const results: FileDownloadResponse[] = []

    for (const filePath of paths) {
      try {
        const fullPath = path.join(this.workingDirectory, filePath)

        if (!fs.existsSync(fullPath)) {
          results.push({
            path: filePath,
            content: null,
            error: 'file_not_found'
          })
          continue
        }

        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
          results.push({
            path: filePath,
            content: null,
            error: 'is_directory'
          })
          continue
        }

        const content = fs.readFileSync(fullPath)
        results.push({
          path: filePath,
          content: new Uint8Array(content),
          error: null
        })
      } catch (err) {
        const error = err as NodeJS.ErrnoException
        if (error.code === 'EACCES') {
          results.push({
            path: filePath,
            content: null,
            error: 'permission_denied'
          })
        } else {
          results.push({
            path: filePath,
            content: null,
            error: 'file_not_found'
          })
        }
      }
    }

    return results
  }
}

@Injectable()
@SandboxProviderStrategy(LOCAL_SHELL_SANDBOX_PROVIDER)
export class LocalShellSandboxProvider implements ISandboxProvider<LocalShellSandbox> {
  readonly type = LOCAL_SHELL_SANDBOX_PROVIDER

  readonly meta: TSandboxProviderMeta = {
    name: {
      en_US: 'Local Shell Sandbox',
      zh_Hans: '本地 Shell 沙盒'
    },
    description: {
      en_US: 'A sandbox that executes shell commands locally on the host machine.',
      zh_Hans: '在主机本地执行 shell 命令的沙盒。'
    },
    icon: {
      type: 'svg',
      value: LOCAL_SHELL_SANDBOX_ICON
    }
  }

  async create(options?: SandboxProviderCreateOptions): Promise<LocalShellSandbox> {
    return new LocalShellSandbox({
      workingDirectory: options?.workingDirectory ?? this.getDefaultWorkingDir()
    })
  }

  getDefaultWorkingDir(): string {
    return path.resolve(process.cwd(), 'sandbox')
  }
}
