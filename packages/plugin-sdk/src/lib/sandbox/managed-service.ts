import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  ISandboxManagedService,
  TSandboxConfigurable,
  TSandboxManagedServiceEnvEntry,
  TSandboxManagedServiceLogs,
  TSandboxManagedServiceStatus,
  TSandboxManagedServiceTransportMode
} from '@xpert-ai/contracts'
import type { MaybePromise } from './protocol'

export type SandboxManagedServiceStateChange = {
  actualPort?: number | null
  exitCode?: number | null
  runtimeRef?: ISandboxManagedService['runtimeRef']
  signal?: string | null
  startedAt?: Date
  status: TSandboxManagedServiceStatus
  stoppedAt?: Date | null
  transportMode?: TSandboxManagedServiceTransportMode | null
}

export type SandboxManagedServiceStartOptions = {
  command: string
  cwd: string
  env?: TSandboxManagedServiceEnvEntry[]
  metadata?: ISandboxManagedService['metadata']
  port?: number | null
  previewPath?: string | null
  readyPattern?: string | null
  serviceId: string
  onStateChange?: (change: SandboxManagedServiceStateChange) => MaybePromise<void>
}

export type SandboxManagedServiceListOptions = {
  services: ISandboxManagedService[]
}

export type SandboxManagedServiceListResult = {
  services: ISandboxManagedService[]
}

export type SandboxManagedServiceLogsOptions = {
  service: ISandboxManagedService
  tail?: number
}

export type SandboxManagedServiceStopOptions = {
  service: ISandboxManagedService
  onStateChange?: (change: SandboxManagedServiceStateChange) => MaybePromise<void>
}

export type SandboxManagedServiceRestartOptions = {
  command: string
  cwd: string
  env?: TSandboxManagedServiceEnvEntry[]
  metadata?: ISandboxManagedService['metadata']
  port?: number | null
  previewPath?: string | null
  readyPattern?: string | null
  service: ISandboxManagedService
  onStateChange?: (change: SandboxManagedServiceStateChange) => MaybePromise<void>
}

export type SandboxManagedServiceStartResult = SandboxManagedServiceStateChange

export interface SandboxManagedServiceAdapter {
  getServiceLogs(options: SandboxManagedServiceLogsOptions): MaybePromise<TSandboxManagedServiceLogs>
  listServices(options: SandboxManagedServiceListOptions): MaybePromise<SandboxManagedServiceListResult>
  restartService(options: SandboxManagedServiceRestartOptions): MaybePromise<SandboxManagedServiceStartResult>
  startService(options: SandboxManagedServiceStartOptions): MaybePromise<SandboxManagedServiceStartResult>
  stopService(options: SandboxManagedServiceStopOptions): MaybePromise<SandboxManagedServiceStateChange>
}

export type SandboxServiceProxyRequest = {
  path: string
  request: IncomingMessage
  response: ServerResponse<IncomingMessage>
  service: ISandboxManagedService
}

export interface SandboxServiceProxyAdapter {
  proxyServiceRequest(request: SandboxServiceProxyRequest): MaybePromise<void>
}

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

export function isSandboxManagedServiceAdapter(value: unknown): value is SandboxManagedServiceAdapter {
  return (
    isObjectLike(value) &&
    typeof Reflect.get(value, 'startService') === 'function' &&
    typeof Reflect.get(value, 'listServices') === 'function' &&
    typeof Reflect.get(value, 'getServiceLogs') === 'function' &&
    typeof Reflect.get(value, 'stopService') === 'function' &&
    typeof Reflect.get(value, 'restartService') === 'function'
  )
}

export function resolveSandboxManagedServiceAdapter(
  sandbox: TSandboxConfigurable | SandboxManagedServiceAdapter | null | undefined | unknown
): SandboxManagedServiceAdapter | null {
  if (!isObjectLike(sandbox)) {
    return null
  }

  const candidate = Reflect.has(sandbox, 'backend') ? Reflect.get(sandbox, 'backend') : sandbox
  return isSandboxManagedServiceAdapter(candidate) ? candidate : null
}

export function isSandboxServiceProxyAdapter(value: unknown): value is SandboxServiceProxyAdapter {
  return isObjectLike(value) && typeof Reflect.get(value, 'proxyServiceRequest') === 'function'
}

export function resolveSandboxServiceProxyAdapter(
  sandbox: TSandboxConfigurable | SandboxServiceProxyAdapter | null | undefined | unknown
): SandboxServiceProxyAdapter | null {
  if (!isObjectLike(sandbox)) {
    return null
  }

  const candidate = Reflect.has(sandbox, 'backend') ? Reflect.get(sandbox, 'backend') : sandbox
  return isSandboxServiceProxyAdapter(candidate) ? candidate : null
}
