export const RUNTIME_RESTART_CONFIRMATION = 'RESTART' as const

export type RuntimeRestartMode = 'self-signal'

export type RuntimeRestartCapabilityReason =
  | 'allowed'
  | 'interactive-auth-required'
  | 'super-admin-required'
  | 'default-tenant-required'

export interface IRuntimeRestartCapability {
  allowed: boolean
  mode: RuntimeRestartMode
  reason: RuntimeRestartCapabilityReason
}

export interface IRuntimeRestartRequest {
  /** Explicit second confirmation required for this destructive operation. */
  confirmation: typeof RUNTIME_RESTART_CONFIRMATION
  /** Optional non-sensitive reason written to the structured server audit log. */
  reason?: string
}

export interface IRuntimeRestartResponse {
  accepted: true
  restartId: string
  mode: RuntimeRestartMode
  instanceId: string
  requestedAt: string
  signalAfterMs: number
  drainTimeoutMs: number
}

export interface IRuntimeReadiness {
  status: 'ready' | 'draining'
  instanceId: string
  activeRequests: number
  restartId?: string
  requestedAt?: string
}
