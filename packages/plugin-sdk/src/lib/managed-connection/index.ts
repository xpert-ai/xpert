export const MANAGED_CONNECTION_REGISTRY_TOKEN = 'XPERT_MANAGED_CONNECTION_REGISTRY'
export const CONNECTION_COMMAND_ROUTER_TOKEN = 'XPERT_CONNECTION_COMMAND_ROUTER'

export type ManagedConnectionTransportType = 'websocket' | 'socket_io' | 'sse' | 'tcp_tunnel' | 'worker' | 'custom'

export type ManagedConnectionStatus = 'connected' | 'disconnected' | 'stale' | 'error'

export type ManagedConnectionDirection = 'inbound' | 'outbound' | 'internal'

export type ManagedConnectionRecord = {
  id?: string
  pluginName: string
  connectionType: string
  connectionKey: string
  transportType: ManagedConnectionTransportType
  direction: ManagedConnectionDirection
  ownerInstanceId: string
  status: ManagedConnectionStatus
  connectedAt?: Date | string | null
  lastSeenAt?: Date | string | null
  leaseExpiresAt?: Date | string | null
  disconnectedAt?: Date | string | null
  remoteAddress?: string | null
  metadata?: Record<string, unknown> | null
  lastError?: string | null
  tenantId?: string | null
  organizationId?: string | null
}

export type RegisterManagedConnectionInput = {
  pluginName: string
  connectionType: string
  connectionKey: string
  transportType: ManagedConnectionTransportType
  direction?: ManagedConnectionDirection
  tenantId?: string | null
  organizationId?: string | null
  remoteAddress?: string | null
  metadata?: Record<string, unknown>
  leaseTtlMs?: number
}

export type ManagedConnectionKeyInput = {
  pluginName?: string
  connectionType: string
  connectionKey: string
  tenantId?: string | null
  organizationId?: string | null
}

export type ManagedConnectionHeartbeatInput = ManagedConnectionKeyInput & {
  remoteAddress?: string | null
  metadata?: Record<string, unknown>
  leaseTtlMs?: number
}

export type ManagedConnectionMetadataInput = ManagedConnectionKeyInput & {
  metadata?: Record<string, unknown>
  merge?: boolean
  leaseTtlMs?: number
}

export type ManagedConnectionListQuery = {
  pluginName?: string
  connectionType?: string
  connectionKey?: string
  transportType?: ManagedConnectionTransportType
  direction?: ManagedConnectionDirection
  ownerInstanceId?: string
  status?: ManagedConnectionStatus | ManagedConnectionStatus[]
  activeOnly?: boolean
  tenantId?: string | null
  organizationId?: string | null
  limit?: number
  offset?: number
}

export type ManagedConnectionCommandRequest<TPayload = unknown> = {
  requestId: string
  connectionType: string
  connectionKey: string
  command: string
  payload?: TPayload
}

export type ManagedConnectionCommandHandler<TPayload = unknown, TResult = unknown> = (
  request: ManagedConnectionCommandRequest<TPayload>
) => Promise<TResult> | TResult

export type ManagedConnectionCommandResult<TResult = unknown> = {
  ok: boolean
  result?: TResult
  error?: string
}

export type ConnectionCommandInvokeOptions = {
  pluginName?: string
  tenantId?: string | null
  organizationId?: string | null
  timeoutMs?: number
}

export interface ManagedConnectionRegistry {
  register(input: RegisterManagedConnectionInput): Promise<ManagedConnectionRecord>
  heartbeat(input: ManagedConnectionHeartbeatInput): Promise<void>
  syncMetadata(input: ManagedConnectionMetadataInput): Promise<void>
  markDisconnected(input: ManagedConnectionKeyInput, reason?: string): Promise<void>
  list(query: ManagedConnectionListQuery): Promise<ManagedConnectionRecord[]>
  getOwner(input: ManagedConnectionKeyInput): Promise<string | null>
}

export interface ConnectionCommandRouter {
  registerHandler(connectionType: string, handler: ManagedConnectionCommandHandler): void
  invokeOwner(
    connectionType: string,
    connectionKey: string,
    command: string,
    payload?: unknown,
    options?: ConnectionCommandInvokeOptions
  ): Promise<unknown>
}
