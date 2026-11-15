import { ExecutionReviewEntity } from './execution-review.entity'
import type {
    IEvolutionScopedEntity,
    IEvolutionTarget,
    ICapabilityVersion,
    ICapabilityVersionBundle,
    IActiveCapabilityPointer,
    ILearningEvent,
    IEvolutionDiagnosis,
    IEvolutionEventCluster,
    IEvolutionExperience,
    IImprovementProposal,
    IEvolutionCandidate,
    IDatasetSnapshot,
    IEvaluationRun,
    IApprovalDecision,
    IReleasePackage,
    IReleaseDeployment,
    IEvolutionCanaryTestOverride,
    IEvolutionAuditEvent,
    IEvolutionRuntimeObservation,
    IEvolutionJob
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

abstract class EvolutionScopedEntity extends TenantOrganizationBaseEntity implements IEvolutionScopedEntity {
    @Column({ type: 'varchar' })
    scopeType: IEvolutionScopedEntity['scopeType']

    @Column({ type: 'varchar' })
    scopeKey: string
}

@Entity('agent_evolution_target')
@Index(['tenantId', 'organizationId', 'targetId'], { unique: true })
export class EvolutionTargetEntity extends TenantOrganizationBaseEntity implements IEvolutionTarget {
    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    providerKey: string

    @Column({ type: 'varchar' })
    status: IEvolutionTarget['status']

    @Column({ type: 'json' })
    descriptor: IEvolutionTarget['descriptor']
}

@Entity('agent_evolution_capability_version')
@Index(['tenantId', 'organizationId', 'versionId'], { unique: true })
@Index(['tenantId', 'organizationId', 'targetId', 'sequence'], { unique: true })
export class CapabilityVersionEntity extends TenantOrganizationBaseEntity implements ICapabilityVersion {
    @Column({ type: 'varchar' })
    versionId: string

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'int' })
    sequence: number

    @Column({ type: 'varchar' })
    artifactHash: string

    @Column({ type: 'varchar', nullable: true })
    sourceCandidateId?: string | null

    @Column({ type: 'json' })
    value: ICapabilityVersion['value']
}

@Entity('agent_evolution_capability_bundle')
@Index(['tenantId', 'organizationId', 'bundleId'], { unique: true })
@Index(['tenantId', 'organizationId', 'bundleHash'])
export class CapabilityVersionBundleEntity extends TenantOrganizationBaseEntity implements ICapabilityVersionBundle {
    @Column({ type: 'varchar' })
    bundleId: string

    @Column({ type: 'varchar' })
    bundleHash: string

    @Column({ type: 'json' })
    value: ICapabilityVersionBundle['value']
}

@Entity('agent_evolution_active_pointer')
@Index(['tenantId', 'organizationId', 'targetId', 'scopeType', 'scopeKey', 'channel'], { unique: true })
export class ActiveCapabilityPointerEntity extends EvolutionScopedEntity implements IActiveCapabilityPointer {
    @Column({ type: 'varchar' })
    pointerId: string

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    channel: IActiveCapabilityPointer['channel']

    @Column({ type: 'varchar' })
    activeVersionId: string

    @Column({ type: 'int' })
    revision: number

    @Column({ type: 'json' })
    value: IActiveCapabilityPointer['value']
}

@Entity('agent_evolution_learning_event')
@Index(['tenantId', 'organizationId', 'idempotencyKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'targetId', 'scopeType', 'scopeKey'])
export class LearningEventEntity extends EvolutionScopedEntity implements ILearningEvent {
    @Column({ type: 'varchar' })
    eventId: string

    @Column({ type: 'varchar' })
    idempotencyKey: string

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    bundleHash: string

    @Column({ type: 'json' })
    value: ILearningEvent['value']
}

@Entity('agent_evolution_diagnosis')
@Index(['tenantId', 'organizationId', 'diagnosisId'], { unique: true })
@Index(['tenantId', 'organizationId', 'targetId', 'scopeKey'])
export class EvolutionDiagnosisEntity extends EvolutionScopedEntity implements IEvolutionDiagnosis {
    @Column({ type: 'varchar' })
    diagnosisId: string

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    correctionSignature: string

    @Column({ type: 'json' })
    value: IEvolutionDiagnosis['value']
}

@Entity('agent_evolution_event_cluster')
@Index(['tenantId', 'organizationId', 'clusterId'], { unique: true })
@Index(['tenantId', 'organizationId', 'targetId', 'scopeKey', 'correctionSignature'])
export class EvolutionEventClusterEntity extends EvolutionScopedEntity implements IEvolutionEventCluster {
    @Column({ type: 'varchar' })
    clusterId: string

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    correctionSignature: string

    @Column({ type: 'varchar' })
    status: IEvolutionEventCluster['status']

    @Column({ type: 'json' })
    value: IEvolutionEventCluster['value']
}

@Entity('agent_evolution_experience')
@Index(['tenantId', 'organizationId', 'experienceId'], { unique: true })
@Index(['tenantId', 'organizationId', 'targetId', 'scopeKey', 'status'])
export class EvolutionExperienceEntity extends EvolutionScopedEntity implements IEvolutionExperience {
    @Column({ type: 'varchar' })
    experienceId: string

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    sourceReleasePackageId: string

    @Column({ type: 'varchar' })
    status: IEvolutionExperience['status']

    @Column({ type: 'json' })
    value: IEvolutionExperience['value']
}

@Entity('agent_evolution_proposal')
@Index('UX_evolution_proposal_request', ['tenantId', 'organizationId', 'targetId', 'requestId'], { unique: true })
@Index(['tenantId', 'organizationId', 'proposalId', 'revision'], { unique: true })
export class ImprovementProposalEntity extends EvolutionScopedEntity implements IImprovementProposal {
    @Column({ type: 'varchar', nullable: true })
    requestId?: string | null

    @Column({ type: 'varchar' })
    proposalId: string

    @Column({ type: 'int' })
    revision: number

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    status: IImprovementProposal['status']

    @Column({ type: 'json' })
    value: IImprovementProposal['value']
}

@Entity('agent_evolution_candidate')
@Index(['tenantId', 'organizationId', 'candidateId'], { unique: true })
@Index(['tenantId', 'organizationId', 'artifactHash'])
export class EvolutionCandidateEntity extends EvolutionScopedEntity implements IEvolutionCandidate {
    @Column({ type: 'varchar' })
    candidateId: string

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    artifactHash: string

    @Column({ type: 'varchar' })
    status: IEvolutionCandidate['status']

    @Column({ type: 'json' })
    value: IEvolutionCandidate['value']
}

@Entity('agent_evolution_dataset_snapshot')
@Index(['tenantId', 'organizationId', 'snapshotId'], { unique: true })
export class DatasetSnapshotEntity extends TenantOrganizationBaseEntity implements IDatasetSnapshot {
    @Column({ type: 'varchar' })
    snapshotId: string

    @Column({ type: 'varchar' })
    datasetId: string

    @Column({ type: 'varchar' })
    snapshotHash: string

    @Column({ type: 'json' })
    value: IDatasetSnapshot['value']
}

@Entity('agent_evolution_evaluation_run')
@Index(['tenantId', 'organizationId', 'runId'], { unique: true })
@Index(['tenantId', 'organizationId', 'candidateId'])
export class EvaluationRunEntity extends TenantOrganizationBaseEntity implements IEvaluationRun {
    @Column({ type: 'varchar' })
    runId: string

    @Column({ type: 'varchar' })
    candidateId: string

    @Column({ type: 'varchar' })
    status: IEvaluationRun['status']

    @Column({ type: 'boolean' })
    gatePassed: boolean

    @Column({ type: 'json' })
    value: IEvaluationRun['value']
}

@Entity('agent_evolution_approval')
@Index(['tenantId', 'organizationId', 'approvalId'], { unique: true })
export class ApprovalDecisionEntity extends EvolutionScopedEntity implements IApprovalDecision {
    @Column({ type: 'varchar' })
    approvalId: string

    @Column({ type: 'varchar' })
    candidateId: string

    @Column({ type: 'varchar' })
    candidateHash: string

    @Column({ type: 'varchar' })
    decision: IApprovalDecision['decision']

    @Column({ type: 'json' })
    value: IApprovalDecision['value']
}

@Entity('agent_evolution_release_package')
@Index(['tenantId', 'organizationId', 'releasePackageId'], { unique: true })
export class ReleasePackageEntity extends EvolutionScopedEntity implements IReleasePackage {
    @Column({ type: 'varchar' })
    releasePackageId: string

    @Column({ type: 'varchar' })
    candidateId: string

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    status: IReleasePackage['status']

    @Column({ type: 'json' })
    value: IReleasePackage['value']
}

@Entity('agent_evolution_release_deployment')
@Index(['tenantId', 'organizationId', 'deploymentId'], { unique: true })
export class ReleaseDeploymentEntity extends EvolutionScopedEntity implements IReleaseDeployment {
    @Column({ type: 'varchar' })
    deploymentId: string

    @Column({ type: 'varchar' })
    releasePackageId: string

    @Column({ type: 'varchar' })
    channel: IReleaseDeployment['channel']

    @Column({ type: 'varchar' })
    status: IReleaseDeployment['status']

    @Column({ type: 'json' })
    value: IReleaseDeployment['value']
}

@Entity('agent_evolution_canary_test_override')
@Index(['tenantId', 'organizationId', 'overrideId'], { unique: true })
@Index(['activeKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'releasePackageId', 'status'])
export class EvolutionCanaryTestOverrideEntity extends EvolutionScopedEntity implements IEvolutionCanaryTestOverride {
    @Column({ type: 'varchar' })
    overrideId: string

    @Column({ type: 'varchar' })
    releasePackageId: string

    @Column({ type: 'varchar' })
    candidateId: string

    @Column({ type: 'varchar' })
    deploymentId: string

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    subjectKey: string

    /** Non-null only while pending; unique so a subject has one live override per deployment. */
    @Column({ type: 'varchar', nullable: true })
    activeKey?: string | null

    @Column({ type: 'varchar' })
    status: IEvolutionCanaryTestOverride['status']

    @Column({ type: 'timestamptz' })
    expiresAt: Date

    @Column({ type: 'json' })
    value: IEvolutionCanaryTestOverride['value']
}

@Entity('agent_evolution_audit_event')
@Index(['tenantId', 'organizationId', 'auditId'], { unique: true })
@Index(['tenantId', 'organizationId', 'releasePackageId'])
export class EvolutionAuditEventEntity extends TenantOrganizationBaseEntity implements IEvolutionAuditEvent {
    @Column({ type: 'varchar' })
    auditId: string

    @Column({ type: 'varchar', nullable: true })
    releasePackageId?: string | null

    @Column({ type: 'varchar', nullable: true })
    candidateId?: string | null

    @Column({ type: 'varchar' })
    action: string

    @Column({ type: 'json' })
    value: IEvolutionAuditEvent['value']
}

@Entity('agent_evolution_runtime_observation')
@Index(['tenantId', 'organizationId', 'observationId'], { unique: true })
@Index(['tenantId', 'organizationId', 'targetId', 'deploymentId'])
export class EvolutionRuntimeObservationEntity extends EvolutionScopedEntity implements IEvolutionRuntimeObservation {
    @Column({ type: 'varchar' })
    observationId: string

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar', nullable: true })
    deploymentId?: string | null

    @Column({ type: 'varchar' })
    executionId: string

    @Column({ type: 'boolean' })
    severeError: boolean

    @Column({ type: 'json' })
    value: IEvolutionRuntimeObservation['value']
}

@Entity('agent_evolution_job')
@Index(['tenantId', 'organizationId', 'jobId'], { unique: true })
@Index(['tenantId', 'organizationId', 'resourceId', 'jobType'])
export class EvolutionJobEntity extends TenantOrganizationBaseEntity implements IEvolutionJob {
    @Column({ type: 'varchar' })
    jobId: string

    @Column({ type: 'varchar' })
    jobType: IEvolutionJob['jobType']

    @Column({ type: 'varchar' })
    resourceId: string

    @Column({ type: 'varchar' })
    status: IEvolutionJob['status']

    @Column({ type: 'json' })
    value: IEvolutionJob['value']
}

export const AGENT_EVOLUTION_ENTITIES = [
    ExecutionReviewEntity,
    EvolutionTargetEntity,
    CapabilityVersionEntity,
    CapabilityVersionBundleEntity,
    ActiveCapabilityPointerEntity,
    LearningEventEntity,
    EvolutionDiagnosisEntity,
    EvolutionEventClusterEntity,
    EvolutionExperienceEntity,
    ImprovementProposalEntity,
    EvolutionCandidateEntity,
    DatasetSnapshotEntity,
    EvaluationRunEntity,
    ApprovalDecisionEntity,
    ReleasePackageEntity,
    ReleaseDeploymentEntity,
    EvolutionCanaryTestOverrideEntity,
    EvolutionAuditEventEntity,
    EvolutionRuntimeObservationEntity,
    EvolutionJobEntity
]
