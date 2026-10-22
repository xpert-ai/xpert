export const RUNTIME_RESTART_CONFIRMATION = 'RESTART' as const

/** Terminal transport interruption; it does not indicate that the background task completed or failed. */
export const RUNTIME_STREAM_INTERRUPTED_EVENT = 'runtime-interrupted' as const

export interface IRuntimeStreamInterruption {
  code: 'RUNTIME_RESTARTING'
  message: string
}

/** Process-supervisor execution modes; neither implies Pod/deployment orchestration. */
export type RuntimeRestartMode = 'self-signal' | 'rolling-self-signal'

export type RuntimeRestartStatus = 'in_progress' | 'completed' | 'failed' | 'awaiting_restart'

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
  /** Explicitly permit restarting the last healthy replica during an operator-approved outage. Defaults to false. */
  allowDowntime?: boolean
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
  /** completed confirms target runtime requirements and replacement readiness, not ingress acknowledgement. */
  status: RuntimeRestartStatus
  requestedAt: string
  targetReplicaCount: number
  /** Includes already-current targets; not a count of ingress-confirmed serving replicas. */
  completedReplicaCount: number
  failedReplicaCount: number
  pluginGeneration: number
  error?: string
}

export interface IPluginRuntimeConvergenceStatus {
  generation: number
  /** Runtime convergence outcome; completed does not attest ingress routing or business acceptance. */
  status: RuntimeRestartStatus
  restartId?: string
  targetReplicaCount: number
  completedReplicaCount: number
  failedReplicaCount: number
  error?: string
}

export type RuntimeAdmissionReason =
  | 'ready'
  | 'startup-not-listening'
  | 'plugin-not-admitted'
  | 'validation-expired'
  | 'lease-expired'

export interface IRuntimeAdmissionDiagnostics {
  reason: RuntimeAdmissionReason
  validationAgeMs: number | null
  validationRemainingMs: number
  leaseRemainingMs?: number
  checkDurationMs: number | null
  checkInFlight: boolean
  lastCheckFailed: boolean
  eventLoopDelayMaxMs?: number
  eventLoopDelayP99Ms?: number
}

export interface IRuntimeReadiness {
  status: 'ready' | 'withdrawing' | 'draining' | 'unready'
  instanceId: string
  activeRequests: number
  admission?: IRuntimeAdmissionDiagnostics
  restartId?: string
  requestedAt?: string
}

/** Registry membership is distinct from liveness; missing heartbeats do not prove retirement. */
export interface IRuntimeInstanceRegistration {
  instanceId: string
  bootId: string
  lastSeenAt: string
  online: boolean
}

export interface IRuntimeInstanceRetirementRequest {
  expectedBootId: string
}

export interface IRuntimeInstanceRetirementResult {
  status: 'retired' | 'not-found' | 'boot-changed' | 'online'
}
