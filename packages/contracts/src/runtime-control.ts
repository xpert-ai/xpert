export const RUNTIME_RESTART_CONFIRMATION = 'RESTART' as const

export type RuntimeRestartMode = 'self-signal' | 'rolling-self-signal'

export type RuntimeRestartStatus = 'in_progress' | 'completed' | 'failed'

export interface IRuntimePluginRequirement {
  scopeKey: string
  pluginName: string
  version?: string
  /** Immutable staged artifact or source revision required on every API replica. */
  runtimeRevision?: string
  state: 'loaded' | 'absent'
}

export interface IPluginRuntimeConvergence {
  generation: number
}

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
  /** Plugin runtime state that every replacement process must confirm after boot. */
  runtimeRequirements?: IRuntimePluginRequirement[]
}

export interface IRuntimeRestartResponse {
  accepted: true
  restartId: string
  /** Durable convergence generation when staged requirements were queued behind another rollout. */
  pluginGeneration?: number
  mode: RuntimeRestartMode
  instanceId: string
  requestedAt: string
  signalAfterMs: number
  drainTimeoutMs: number
}

export interface IRuntimeRestartStatus {
  restartId: string
  mode: RuntimeRestartMode
  status: RuntimeRestartStatus
  requestedAt: string
  targetReplicaCount: number
  completedReplicaCount: number
  failedReplicaCount: number
  pluginGeneration: number
  error?: string
}

export interface IPluginRuntimeConvergenceStatus {
  generation: number
  status: RuntimeRestartStatus
  restartId?: string
  targetReplicaCount: number
  completedReplicaCount: number
  failedReplicaCount: number
  error?: string
}

export interface IRuntimeReadiness {
  status: 'ready' | 'draining'
  instanceId: string
  activeRequests: number
  restartId?: string
  requestedAt?: string
}
