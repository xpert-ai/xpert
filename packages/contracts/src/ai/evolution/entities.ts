import type { IBasePerTenantAndOrganizationEntityModel } from '../../base-entity.model'
import type { EvolutionCandidate } from './candidate'
import type { ActiveCapabilityPointer, CapabilityVersion, CapabilityVersionBundle } from './capability-version'
import type { DatasetSnapshot, EvaluationRun } from './evaluation'
import type { ExecutionReviewReceipt } from './execution-review'
import type { EvolutionExperience } from './experience'
import type { EvolutionJob, EvolutionJobStatus, EvolutionJobType } from './governance'
import type { EvolutionDiagnosis, EvolutionEventCluster, ImprovementProposal, LearningEvent } from './learning-event'
import type { StoredEvaluationRun, StoredEvolutionProposal, StoredReleasePackage } from './persistence'
import type {
  ApprovalDecision,
  EvolutionAuditEvent,
  EvolutionCanaryTestOverride,
  EvolutionReleaseStatus,
  ReleaseDeployment
} from './release'
import type { EvolutionRuntimeObservation } from './runtime'
import type { EvolutionScopeType, EvolutionTargetDescriptor } from './target'

export interface IEvolutionScopedEntity extends IBasePerTenantAndOrganizationEntityModel {
  scopeType: EvolutionScopeType
  scopeKey: string
}

export interface IEvolutionTarget extends IBasePerTenantAndOrganizationEntityModel {
  targetId: string
  providerKey: string
  status: EvolutionTargetDescriptor['status']
  descriptor: EvolutionTargetDescriptor
}

export interface ICapabilityVersion extends IBasePerTenantAndOrganizationEntityModel {
  versionId: string
  targetId: string
  sequence: number
  artifactHash: string
  sourceCandidateId?: string | null
  value: CapabilityVersion
}

export interface ICapabilityVersionBundle extends IBasePerTenantAndOrganizationEntityModel {
  bundleId: string
  bundleHash: string
  value: CapabilityVersionBundle
}

export interface IActiveCapabilityPointer extends IEvolutionScopedEntity {
  pointerId: string
  targetId: string
  channel: ActiveCapabilityPointer['channel']
  activeVersionId: string
  revision: number
  value: ActiveCapabilityPointer
}

export interface ILearningEvent extends IEvolutionScopedEntity {
  eventId: string
  idempotencyKey: string
  targetId: string
  bundleHash: string
  value: LearningEvent
}

export interface IEvolutionDiagnosis extends IEvolutionScopedEntity {
  diagnosisId: string
  targetId: string
  correctionSignature: string
  value: EvolutionDiagnosis
}

export interface IEvolutionEventCluster extends IEvolutionScopedEntity {
  clusterId: string
  targetId: string
  correctionSignature: string
  status: EvolutionEventCluster['status']
  value: EvolutionEventCluster
}

export interface IEvolutionExperience extends IEvolutionScopedEntity {
  experienceId: string
  targetId: string
  sourceReleasePackageId: string
  status: EvolutionExperience['status']
  value: EvolutionExperience
}

export interface IImprovementProposal extends IEvolutionScopedEntity {
  requestId?: string | null
  proposalId: string
  revision: number
  targetId: string
  status: ImprovementProposal['status']
  value: StoredEvolutionProposal
}

export interface IEvolutionCandidate extends IEvolutionScopedEntity {
  candidateId: string
  targetId: string
  artifactHash: string
  status: EvolutionCandidate['status']
  value: EvolutionCandidate
}

export interface IDatasetSnapshot extends IBasePerTenantAndOrganizationEntityModel {
  snapshotId: string
  datasetId: string
  snapshotHash: string
  value: DatasetSnapshot
}

export interface IEvaluationRun extends IBasePerTenantAndOrganizationEntityModel {
  runId: string
  candidateId: string
  status: EvaluationRun['status']
  gatePassed: boolean
  value: StoredEvaluationRun
}

export interface IApprovalDecision extends IEvolutionScopedEntity {
  approvalId: string
  candidateId: string
  candidateHash: string
  decision: ApprovalDecision['decision']
  value: ApprovalDecision
}

export interface IReleasePackage extends IEvolutionScopedEntity {
  releasePackageId: string
  candidateId: string
  targetId: string
  status: StoredReleasePackage['status']
  value: StoredReleasePackage
}

export interface IReleaseDeployment extends IEvolutionScopedEntity {
  deploymentId: string
  releasePackageId: string
  channel: ReleaseDeployment['channel']
  status: EvolutionReleaseStatus
  value: ReleaseDeployment
}

export interface IEvolutionCanaryTestOverride extends IEvolutionScopedEntity {
  overrideId: string
  releasePackageId: string
  candidateId: string
  deploymentId: string
  targetId: string
  subjectKey: string
  activeKey?: string | null
  status: EvolutionCanaryTestOverride['status']
  expiresAt: Date
  value: EvolutionCanaryTestOverride
}

export interface IEvolutionAuditEvent extends IBasePerTenantAndOrganizationEntityModel {
  auditId: string
  releasePackageId?: string | null
  candidateId?: string | null
  action: string
  value: EvolutionAuditEvent
}

export interface IEvolutionRuntimeObservation extends IEvolutionScopedEntity {
  observationId: string
  targetId: string
  deploymentId?: string | null
  executionId: string
  severeError: boolean
  value: EvolutionRuntimeObservation
}

export interface IEvolutionJob extends IBasePerTenantAndOrganizationEntityModel {
  jobId: string
  jobType: EvolutionJobType
  resourceId: string
  status: EvolutionJobStatus
  value: EvolutionJob
}

export interface IExecutionReview extends IBasePerTenantAndOrganizationEntityModel {
  id: string
  tenantId: string
  organizationId: string
  targetId: string
  executionId: string
  projectId: string
  conversationId: string
  bundleHash: string
  receipt: ExecutionReviewReceipt
}
