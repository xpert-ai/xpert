import { EvolutionChannel, EvolutionProviderContext, EvolutionScope } from './target'

/** State of a staged release; installation, partial exposure and full activation are distinct states. */
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

/** Authority under which a release decision was signed, separate from the actor's role label. */
export type EvolutionApprovalAuthority = 'standard' | 'administrator'

/** Identifies the policy frozen into a release; manual_test is restricted to non-production. */
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
  /** Minimum observations in the final canary stage before full activation. */
  productionCanaryMinimumSamples: number
  productionCanaryMinimumDurationHours: number
  /** Minimum production observations before the release can be recorded as an experience. */
  experienceMinimumSamples: number
  experienceMinimumDurationHours: number
}

/** Human decision bound to one candidate content hash, evaluation run and scope; it does not transfer to a changed candidate. */
export interface ApprovalDecision {
  approvalId: string
  candidateId: string
  candidateHash: string
  evaluationRunId: string
  /** Identifies the frozen strategy covered by this decision, when recorded. */
  strategyHash?: string
  scope: EvolutionScope
  decision: 'approved' | 'rejected'
  actorId: string
  actorRole: string
  /** Role name at the time of the decision, independent of later role changes. */
  actorRoleName?: string
  /** Authority of this decision; absence does not establish administrator authority. */
  approvalAuthority?: EvolutionApprovalAuthority
  reason: string
  decidedAt: string
}

/** Binds a staged rollout to the approved artifact, evaluation, scope and rollback version. */
export interface ReleasePackage {
  publicationKind: 'staged_rollout'
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

/** One stage of a release in one channel, with measurements attributable to that stage. */
export interface ReleaseDeployment {
  deploymentId: string
  releasePackageId: string
  channel: EvolutionChannel
  scope: EvolutionScope
  status: EvolutionReleaseStatus
  /** Distinguishes replay measurements from observations of actual executions. */
  dataSource: 'deterministic_replay' | 'runtime_telemetry'
  sampleCount: number
  candidateAccuracy: number
  severeErrors: number
  /** Share of eligible subjects intended to receive the candidate, not its observed success rate. */
  canaryPercent: number
  observations: ReleaseRuntimeObservation[]
  startedAt: string
  completedAt?: string
}

/** Cumulative measurements for a deployment as of this observation. */
export interface ReleaseRuntimeObservation {
  observationId: string
  observedAt: string
  sequence: number
  sampleCount: number
  /** Accuracy on paired inputs with a known baseline outcome. Null means no baseline accuracy is available; zero is a measured result. */
  baselineAccuracy: number | null
  /** Number of paired observations contributing to baseline accuracy, when reported; may be less than sampleCount. */
  pairedBaselineSamples?: number
  candidateAccuracy: number
  severeErrors: number
  p95LatencyMs: number
  averageCost: number
}

/** Scoped release operation bound to a specific version and artifact hash. */
export interface ReleaseProviderRequest {
  context?: EvolutionProviderContext
  targetId: string
  versionId: string
  artifactHash: string
  scope: EvolutionScope
  releasePackageId: string
  actorId: string
  /** Stable operation identity; retrying must not duplicate the release effect. */
  idempotencyKey: string
}

/** Evidence of a provider operation on the identified version, separate from the platform's active selection. */
export interface ReleaseProviderReceipt {
  receiptId: string
  versionId: string
  operation: 'install' | 'activate' | 'rollback'
  status: 'ready' | 'completed'
  providerTraceId: string
}

/** Attribution of a governance action to an actor and time, optionally tied to a candidate or release. */
export interface EvolutionAuditEvent {
  auditId: string
  releasePackageId?: string
  candidateId?: string
  action: string
  actorId: string
  actorRole: string
  summary: string
  metadata?: EvolutionAuditEventMetadata
  occurredAt: string
}

/** Structured references for correlating a governance action with a deployment, subject or execution. */
export interface EvolutionAuditEventMetadata {
  manualTestOverrideId?: string
  deploymentId?: string
  subjectKey?: string
  executionId?: string
  reason?: string
  overrideStatus?: EvolutionCanaryTestOverrideStatus
}

/** A pending test assignment can be consumed once or expire unused. */
export type EvolutionCanaryTestOverrideStatus = 'pending' | 'consumed' | 'expired'

/**
 * Administrator-created, single-use Candidate assignment for one Canary subject.
 * It is available only to releases frozen with the non-production `manual_test` gate profile.
 */
export interface EvolutionCanaryTestOverride {
  overrideId: string
  releasePackageId: string
  candidateId: string
  deploymentId: string
  targetId: string
  scope: EvolutionScope
  subjectKey: string
  status: EvolutionCanaryTestOverrideStatus
  reason: string
  createdBy: string
  createdByRole: string
  createdAt: string
  expiresAt: string
  consumedAt?: string
  consumedByExecutionId?: string
}
