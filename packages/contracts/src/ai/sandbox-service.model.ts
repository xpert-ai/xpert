import { JSONValue } from '../core.model'

export const SANDBOX_MANAGED_SERVICE_STATUSES = [
  'starting',
  'running',
  'stopping',
  'stopped',
  'failed',
  'lost'
] as const

export type TSandboxManagedServiceStatus = (typeof SANDBOX_MANAGED_SERVICE_STATUSES)[number]

export const SANDBOX_MANAGED_SERVICE_TRANSPORT_MODES = ['none', 'http'] as const

export type TSandboxManagedServiceTransportMode = (typeof SANDBOX_MANAGED_SERVICE_TRANSPORT_MODES)[number]

export type TSandboxManagedServiceEnvEntry = {
  name: string
  value: string
}

export interface ISandboxManagedService {
  id?: string
  conversationId: string
  provider: string
  name: string
  command: string
  workingDirectory: string
  requestedPort?: number | null
  actualPort?: number | null
  previewPath?: string | null
  status: TSandboxManagedServiceStatus
  runtimeRef?: JSONValue | null
  transportMode?: TSandboxManagedServiceTransportMode | null
  ownerExecutionId?: string | null
  ownerAgentKey?: string | null
  startedAt?: Date | string | null
  stoppedAt?: Date | string | null
  exitCode?: number | null
  signal?: string | null
  metadata?: JSONValue | null
  previewUrl?: string | null
}

export type TSandboxManagedServicePreviewSession = {
  expiresAt: string
  previewUrl: string
}

export type TSandboxManagedServiceStartInput = {
  name: string
  command: string
  cwd?: string | null
  port?: number | null
  previewPath?: string | null
  readyPattern?: string | null
  env?: TSandboxManagedServiceEnvEntry[]
  replaceExisting?: boolean
}

export type TSandboxManagedServiceLogs = {
  stderr: string
  stdout: string
}

export enum SandboxManagedServiceErrorCode {
  ConversationNotFound = 'conversation_not_found',
  ConversationRequired = 'conversation_required',
  PortRequired = 'port_required',
  ProviderUnavailable = 'provider_unavailable',
  PreviewUnavailable = 'preview_unavailable',
  SandboxDisabled = 'sandbox_disabled',
  ServiceNameConflict = 'service_name_conflict',
  ServiceNotFound = 'service_not_found',
  ServiceStartFailed = 'service_start_failed',
  ServiceStopFailed = 'service_stop_failed',
  UnsupportedProvider = 'unsupported_provider'
}
