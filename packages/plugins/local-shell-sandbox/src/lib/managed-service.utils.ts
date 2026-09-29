import cp from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { t } from 'i18next'
import type { SandboxManagedServiceStateChange } from '@xpert-ai/plugin-sdk'
import type { ISandboxManagedService, TSandboxManagedServiceEnvEntry } from '@xpert-ai/contracts'

export type ManagedServiceLogPaths = {
  stderrPath: string
  stdoutPath: string
}

export type ManagedServiceMetadataCandidate = {
  logs?: {
    stderrPath?: unknown
    stdoutPath?: unknown
  }
}

export type LocalManagedServiceRecord = {
  actualPort?: number | null
  child: cp.ChildProcess
  cwd: string
  exitPromise: Promise<SandboxManagedServiceStateChange>
  logPaths: ManagedServiceLogPaths
  requestedPort?: number | null
  resolveExit: (change: SandboxManagedServiceStateChange) => void
  status: SandboxManagedServiceStateChange
}

export function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function normalizeHeaderValue(value: number | string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(', ') : (value?.toString() ?? '')
}

export function shouldRewritePreviewResponse(headers: http.IncomingHttpHeaders, method: string | undefined): boolean {
  if (method === 'HEAD') {
    return false
  }

  if (normalizeHeaderValue(headers['content-encoding']).trim()) {
    return false
  }

  const contentType = normalizeHeaderValue(headers['content-type']).toLowerCase()
  return (
    contentType.includes('text/html') ||
    contentType.includes('application/xhtml+xml') ||
    contentType.includes('text/css') ||
    contentType.includes('javascript') ||
    contentType.includes('ecmascript')
  )
}

export function shouldForwardProxyResponseHeader(name: string, rewriteBody: boolean): boolean {
  const normalized = name.toLowerCase()
  if (
    normalized === 'connection' ||
    normalized === 'keep-alive' ||
    normalized === 'proxy-authenticate' ||
    normalized === 'proxy-authorization' ||
    normalized === 'service-worker-allowed' ||
    normalized === 'set-cookie' ||
    normalized === 'te' ||
    normalized === 'trailer' ||
    normalized === 'transfer-encoding' ||
    normalized === 'upgrade'
  ) {
    return false
  }

  return !rewriteBody || (normalized !== 'content-length' && normalized !== 'content-encoding')
}

export function normalizePreviewProxyBasePath(service: ISandboxManagedService): string | null {
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

export function rewritePreviewRootPath(pathname: string, proxyBasePath: string): string {
  if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.startsWith(proxyBasePath)) {
    return pathname
  }

  return `${proxyBasePath}${pathname.replace(/^\/+/, '')}`
}

export function rewritePreviewTextResponse(content: string, proxyBasePath: string): string {
  return content
    .replace(/(["'`])\/(?!\/)([^"'`\s<>)]*)/g, (_match, quote: string, pathname: string) => {
      return `${quote}${rewritePreviewRootPath(`/${pathname}`, proxyBasePath)}`
    })
    .replace(
      /(\b(?:src|href|action|poster|data|xlink:href)\s*=\s*)(\/(?!\/)[^\s"'<>]*)/gi,
      (_match, prefix: string, pathname: string) => `${prefix}${rewritePreviewRootPath(pathname, proxyBasePath)}`
    )
    .replace(/(url\(\s*)(\/(?!\/)[^"')\s]+)(\s*\))/gi, (_match, prefix: string, pathname: string, suffix: string) => {
      return `${prefix}${rewritePreviewRootPath(pathname, proxyBasePath)}${suffix}`
    })
}

export function normalizeServiceEnv(entries: TSandboxManagedServiceEnvEntry[] | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}

  for (const entry of entries ?? []) {
    if (!entry.name.trim()) {
      continue
    }

    env[entry.name] = entry.value
  }

  return env
}

export function isProcessMissingError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ESRCH'
}

export function killProcessGroup(processId: number | undefined, signal: NodeJS.Signals): void {
  if (!processId) {
    return
  }

  if (process.platform === 'win32') {
    process.kill(processId, signal)
    return
  }

  process.kill(-processId, signal)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function resolveServiceLogPaths(
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

export function ensureServiceLogDirectory(logPaths: ManagedServiceLogPaths): void {
  fs.mkdirSync(path.dirname(logPaths.stdoutPath), { recursive: true })
  fs.mkdirSync(path.dirname(logPaths.stderrPath), { recursive: true })
}

export function readLogTail(filePath: string, maxLines: number): string {
  if (!fs.existsSync(filePath)) {
    return ''
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/)
  return lines
    .slice(Math.max(0, lines.length - maxLines))
    .join('\n')
    .trim()
}

const MAX_SERVICE_READY_TEXT_BYTES = 4096

export function normalizeServiceReadyText(value: string | null | undefined): string | null {
  if (!isNonEmptyString(value)) {
    return null
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_SERVICE_READY_TEXT_BYTES) {
    const fallbackMessage = `Service readiness text must not exceed ${MAX_SERVICE_READY_TEXT_BYTES} UTF-8 bytes.`
    throw new Error(
      t('server-ai:Error.SandboxServiceReadyTextTooLarge', {
        defaultValue: fallbackMessage,
        maxBytes: MAX_SERVICE_READY_TEXT_BYTES
      }) || fallbackMessage
    )
  }
  return value
}

export function doesServiceLogMatch(logPaths: ManagedServiceLogPaths, readyText: string): boolean {
  return `${readLogTail(logPaths.stdoutPath, 200)}\n${readLogTail(logPaths.stderrPath, 200)}`.includes(readyText)
}

export function waitForPort(port: number, timeoutMs: number): Promise<void> {
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

export function ensurePortIsAvailable(port: number): Promise<void> {
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
