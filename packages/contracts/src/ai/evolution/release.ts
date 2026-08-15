import { EvolutionChannel, EvolutionProviderContext, EvolutionScope } from './target'

export type EvolutionReleaseStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'installed'
  | 'shadow'
  | 'canary'
  | 'active'
  | 'paused'
  | 'rolled_back'
  | 'superseded'

export type EvolutionApprovalAuthority = 'standard' | 'administrator'

export type EvolutionReleaseGateProfile = 'standard' | 'manual_test'

/**
 * Frozen staged-release gates. `manual_test` is accepted only by a
 * non-production server and requires an administrator for gated actions.
 */
export interface EvolutionReleaseGatePolicy {
  profile: EvolutionReleaseGateProfile
  shadowMinimumSamples: number
  shadowMinimumDurationHours: number
  canaryMinimumSamples: number
  canaryMinimumDurationHours: number
  productionCanaryMinimumSamples: number
  productionCanaryMinimumDurationHours: number
  experienceMinimumSamples: number
  experienceMinimumDurationHours: number
}

export interface ApprovalDecision {
  approvalId: string
  candidateId: string
  candidateHash: string
  evaluationRunId: string
  scope: EvolutionScope
  decision: 'approved' | 'rejected'
  actorId: string
  actorRole: string
  /** Stable role name recorded at decision time for audit display. */
  actorRoleName?: string
  /**
   * Administrator approvals are a governed single-approver path. Missing values
   * are treated as `standard` for records created before this field existed.
   */
  approvalAuthority?: EvolutionApprovalAuthority
  reason: string
  decidedAt: string
}

export interface ReleasePackage {
  releasePackageId: string
  candidateId: string
  candidateHash: string
  targetId: string
  targetVersionId: string
  rollbackVersionId: string
  evaluationRunId: string
  scope: EvolutionScope
  status: EvolutionReleaseStatus
  approvalIds: string[]
  artifactHash: string
  providerKey: string
  providerVersion: string
  /** Missing only on release packages created before gate policies were frozen. */
  gatePolicy?: EvolutionReleaseGatePolicy
  /** @deprecated Read `gatePolicy.shadowMinimumSamples` for new release packages. */
  shadowMinimumSamples: number
  canaryPercent: number
  createdAt: string
  createdBy: string
}

export interface ReleaseDeployment {
  deploymentId: string
  releasePackageId: string
  channel: EvolutionChannel
  scope: EvolutionScope
  status: EvolutionReleaseStatus
  dataSource: 'deterministic_replay' | 'runtime_telemetry'
  sampleCount: number
  candidateAccuracy: number
  severeErrors: number
  canaryPercent: number
  observations: ReleaseRuntimeObservation[]
  startedAt: string
  completedAt?: string
}

export interface ReleaseRuntimeObservation {
  observationId: string
  observedAt: string
  sequence: number
  sampleCount: number
  baselineAccuracy: number
  candidateAccuracy: number
  severeErrors: number
  p95LatencyMs: number
  averageCost: number
}

export interface ReleaseProviderRequest {
  context?: EvolutionProviderContext
  targetId: string
  versionId: string
  artifactHash: string
  scope: EvolutionScope
  releasePackageId: string
  actorId: string
  idempotencyKey: string
}

export interface ReleaseProviderReceipt {
  receiptId: string
  versionId: string
  operation: 'install' | 'activate' | 'rollback'
  status: 'ready' | 'completed'
  providerTraceId: string
}

export interface EvolutionAuditEvent {
  auditId: string
  releasePackageId?: string
  candidateId?: string
  action: string
  actorId: string
  actorRole: string
  summary: string
  occurredAt: string
}
