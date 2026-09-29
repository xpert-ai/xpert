import cp from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { t } from 'i18next'
import {
  appendSandboxMessage,
  BaseSandbox,
  buildSandboxTimeoutMessage,
  DEFAULT_SANDBOX_SHELL_EXECUTION_OPTIONS,
  ExecuteResponse,
  FileDownloadResponse,
  FileUploadResponse,
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
  SandboxExecutionOptions
} from '@xpert-ai/plugin-sdk'
import type { SandboxTerminalAdapter, SandboxTerminalOpenOptions, SandboxTerminalSession } from '@xpert-ai/plugin-sdk'
import type { ISandboxManagedService, TSandboxManagedServiceLogs } from '@xpert-ai/contracts'

import { openLocalTerminal } from './terminal'
import {
  LocalManagedServiceRecord,
  ManagedServiceLogPaths,
  isFiniteNumber,
  normalizeHeaderValue,
  shouldRewritePreviewResponse,
  shouldForwardProxyResponseHeader,
  normalizePreviewProxyBasePath,
  rewritePreviewTextResponse,
  normalizeServiceEnv,
  isProcessMissingError,
  killProcessGroup,
  sleep,
  resolveServiceLogPaths,
  ensureServiceLogDirectory,
  readLogTail,
  normalizeServiceReadyText,
  doesServiceLogMatch,
  waitForPort,
  ensurePortIsAvailable
} from './managed-service.utils'

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
    return openLocalTerminal(this.workingDirectory, options)
  }

  async startService(options: SandboxManagedServiceStartOptions): Promise<SandboxManagedServiceStartResult> {
    const cwd = path.resolve(options.cwd || this.workingDirectory)
    const readyText = normalizeServiceReadyText(options.readyPattern)
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
        readyPattern: readyText
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
    delete headers.authorization
    delete headers.connection
    delete headers.cookie
    delete headers['keep-alive']
    delete headers['proxy-authenticate']
    delete headers['proxy-authorization']
    delete headers['x-api-key']
    delete headers['x-auth-token']
    delete headers['x-client-secret']
    delete headers['x-csrf-token']
    delete headers['x-xsrf-token']
    delete headers.trailer
    delete headers['transfer-encoding']
    delete headers.upgrade
    delete headers['accept-encoding']
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
          const proxyBasePath = normalizePreviewProxyBasePath(request.service)
          const rewriteBody = Boolean(
            proxyBasePath && shouldRewritePreviewResponse(upstreamResponse.headers, request.request.method)
          )

          request.response.statusCode = upstreamResponse.statusCode ?? 502
          for (const [name, value] of Object.entries(upstreamResponse.headers)) {
            if (value !== undefined && shouldForwardProxyResponseHeader(name, rewriteBody)) {
              request.response.setHeader(name, value)
            }
          }

          if (!rewriteBody || !proxyBasePath) {
            upstreamResponse.pipe(request.response)
            upstreamResponse.on('end', () => resolve())
            return
          }

          const chunks: Buffer[] = []
          upstreamResponse.on('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          })
          upstreamResponse.on('end', () => {
            request.response.end(rewritePreviewTextResponse(Buffer.concat(chunks).toString('utf8'), proxyBasePath))
            resolve()
          })
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
    const readyText = normalizeServiceReadyText(params.readyPattern)
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

      if (readyText && doesServiceLogMatch(params.logPaths, readyText)) {
        return
      }

      if (!params.port && !readyText) {
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
        const fullPath = this.resolveSandboxFilePath(filePath)
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
        const fullPath = this.resolveSandboxFilePath(filePath)

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
        } else if (error.code === 'EINVAL') {
          results.push({
            path: filePath,
            content: null,
            error: 'invalid_path'
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

  private resolveSandboxFilePath(filePath: string): string {
    const resolvedPath = path.resolve(this.workingDirectory, filePath)
    const relativePath = path.relative(this.workingDirectory, resolvedPath)
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      const error = new Error(`Path is outside of the sandbox working directory: ${filePath}`) as NodeJS.ErrnoException
      error.code = 'EINVAL'
      throw error
    }
    return resolvedPath
  }
}
