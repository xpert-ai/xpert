import type {
    ActiveCapabilityPointer,
    ApprovalDecision,
    CapabilityVersion,
    CapabilityVersionBundle,
    DatasetSnapshot,
    EvaluationRun,
    EvolutionAuditEvent,
    EvolutionCanaryTestOverride,
    EvolutionCandidate,
    EvolutionReleaseStatus,
    EvolutionJob,
    EvolutionJobStatus,
    EvolutionJobType,
    EvolutionRuntimeObservation,
    EvolutionDiagnosis,
    EvolutionEventCluster,
    EvolutionExperience,
    EvolutionScopeType,
    EvolutionTargetDescriptor,
    ImprovementProposal,
    LearningEvent,
    ReleaseDeployment,
    ReleasePackage
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

abstract class EvolutionScopedEntity extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar' })
    scopeType: EvolutionScopeType

    @Column({ type: 'varchar' })
    scopeKey: string
}

@Entity('agent_evolution_target')
@Index(['tenantId', 'organizationId', 'targetId'], { unique: true })
export class EvolutionTargetEntity extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    providerKey: string

    @Column({ type: 'varchar' })
    status: EvolutionTargetDescriptor['status']

    @Column({ type: 'json' })
    descriptor: EvolutionTargetDescriptor
}

@Entity('agent_evolution_capability_version')
@Index(['tenantId', 'organizationId', 'versionId'], { unique: true })
@Index(['tenantId', 'organizationId', 'targetId', 'sequence'], { unique: true })
export class CapabilityVersionEntity extends TenantOrganizationBaseEntity {
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
    value: CapabilityVersion
}

@Entity('agent_evolution_capability_bundle')
@Index(['tenantId', 'organizationId', 'bundleId'], { unique: true })
@Index(['tenantId', 'organizationId', 'bundleHash'])
export class CapabilityVersionBundleEntity extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar' })
    bundleId: string

    @Column({ type: 'varchar' })
    bundleHash: string

    @Column({ type: 'json' })
    value: CapabilityVersionBundle
}

@Entity('agent_evolution_active_pointer')
@Index(['tenantId', 'organizationId', 'targetId', 'scopeType', 'scopeKey', 'channel'], { unique: true })
export class ActiveCapabilityPointerEntity extends EvolutionScopedEntity {
    @Column({ type: 'varchar' })
    pointerId: string

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    channel: ActiveCapabilityPointer['channel']

    @Column({ type: 'varchar' })
    activeVersionId: string

    @Column({ type: 'int' })
    revision: number

    @Column({ type: 'json' })
    value: ActiveCapabilityPointer
}

@Entity('agent_evolution_learning_event')
@Index(['tenantId', 'organizationId', 'idempotencyKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'targetId', 'scopeType', 'scopeKey'])
export class LearningEventEntity extends EvolutionScopedEntity {
    @Column({ type: 'varchar' })
    eventId: string

    @Column({ type: 'varchar' })
    idempotencyKey: string

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    bundleHash: string

    @Column({ type: 'json' })
    value: LearningEvent
}

@Entity('agent_evolution_diagnosis')
@Index(['tenantId', 'organizationId', 'diagnosisId'], { unique: true })
@Index(['tenantId', 'organizationId', 'targetId', 'scopeKey'])
export class EvolutionDiagnosisEntity extends EvolutionScopedEntity {
    @Column({ type: 'varchar' })
    diagnosisId: string

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    correctionSignature: string

    @Column({ type: 'json' })
    value: EvolutionDiagnosis
}

@Entity('agent_evolution_event_cluster')
@Index(['tenantId', 'organizationId', 'clusterId'], { unique: true })
@Index(['tenantId', 'organizationId', 'targetId', 'scopeKey', 'correctionSignature'])
export class EvolutionEventClusterEntity extends EvolutionScopedEntity {
    @Column({ type: 'varchar' })
    clusterId: string

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    correctionSignature: string

    @Column({ type: 'varchar' })
    status: EvolutionEventCluster['status']

    @Column({ type: 'json' })
    value: EvolutionEventCluster
}

@Entity('agent_evolution_experience')
@Index(['tenantId', 'organizationId', 'experienceId'], { unique: true })
@Index(['tenantId', 'organizationId', 'targetId', 'scopeKey', 'status'])
export class EvolutionExperienceEntity extends EvolutionScopedEntity {
    @Column({ type: 'varchar' })
    experienceId: string

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    sourceReleasePackageId: string

    @Column({ type: 'varchar' })
    status: EvolutionExperience['status']

    @Column({ type: 'json' })
    value: EvolutionExperience
}

@Entity('agent_evolution_proposal')
@Index(['tenantId', 'organizationId', 'proposalId', 'revision'], { unique: true })
export class ImprovementProposalEntity extends EvolutionScopedEntity {
    @Column({ type: 'varchar' })
    proposalId: string

    @Column({ type: 'int' })
    revision: number

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    status: ImprovementProposal['status']

    @Column({ type: 'json' })
    value: ImprovementProposal
}

@Entity('agent_evolution_candidate')
@Index(['tenantId', 'organizationId', 'candidateId'], { unique: true })
@Index(['tenantId', 'organizationId', 'artifactHash'])
export class EvolutionCandidateEntity extends EvolutionScopedEntity {
    @Column({ type: 'varchar' })
    candidateId: string

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    artifactHash: string

    @Column({ type: 'varchar' })
    status: EvolutionCandidate['status']

    @Column({ type: 'json' })
    value: EvolutionCandidate
}

@Entity('agent_evolution_dataset_snapshot')
@Index(['tenantId', 'organizationId', 'snapshotId'], { unique: true })
export class DatasetSnapshotEntity extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar' })
    snapshotId: string

    @Column({ type: 'varchar' })
    datasetId: string

    @Column({ type: 'varchar' })
    snapshotHash: string

    @Column({ type: 'json' })
    value: DatasetSnapshot
}

@Entity('agent_evolution_evaluation_run')
@Index(['tenantId', 'organizationId', 'runId'], { unique: true })
@Index(['tenantId', 'organizationId', 'candidateId'])
export class EvaluationRunEntity extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar' })
    runId: string

    @Column({ type: 'varchar' })
    candidateId: string

    @Column({ type: 'varchar' })
    status: EvaluationRun['status']

    @Column({ type: 'boolean' })
    gatePassed: boolean

    @Column({ type: 'json' })
    value: EvaluationRun
}

@Entity('agent_evolution_approval')
@Index(['tenantId', 'organizationId', 'approvalId'], { unique: true })
export class ApprovalDecisionEntity extends EvolutionScopedEntity {
    @Column({ type: 'varchar' })
    approvalId: string

    @Column({ type: 'varchar' })
    candidateId: string

    @Column({ type: 'varchar' })
    candidateHash: string

    @Column({ type: 'varchar' })
    decision: ApprovalDecision['decision']

    @Column({ type: 'json' })
    value: ApprovalDecision
}

@Entity('agent_evolution_release_package')
@Index(['tenantId', 'organizationId', 'releasePackageId'], { unique: true })
export class ReleasePackageEntity extends EvolutionScopedEntity {
    @Column({ type: 'varchar' })
    releasePackageId: string

    @Column({ type: 'varchar' })
    candidateId: string

    @Column({ type: 'varchar' })
    targetId: string

    @Column({ type: 'varchar' })
    status: EvolutionReleaseStatus

    @Column({ type: 'json' })
    value: ReleasePackage
}

@Entity('agent_evolution_release_deployment')
@Index(['tenantId', 'organizationId', 'deploymentId'], { unique: true })
export class ReleaseDeploymentEntity extends EvolutionScopedEntity {
    @Column({ type: 'varchar' })
    deploymentId: string

    @Column({ type: 'varchar' })
    releasePackageId: string

    @Column({ type: 'varchar' })
    channel: ReleaseDeployment['channel']

    @Column({ type: 'varchar' })
    status: EvolutionReleaseStatus

    @Column({ type: 'json' })
    value: ReleaseDeployment
}

@Entity('agent_evolution_canary_test_override')
@Index(['tenantId', 'organizationId', 'overrideId'], { unique: true })
@Index(['activeKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'releasePackageId', 'status'])
export class EvolutionCanaryTestOverrideEntity extends EvolutionScopedEntity {
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
    status: EvolutionCanaryTestOverride['status']

    @Column({ type: 'timestamptz' })
    expiresAt: Date

    @Column({ type: 'json' })
    value: EvolutionCanaryTestOverride
}

@Entity('agent_evolution_audit_event')
@Index(['tenantId', 'organizationId', 'auditId'], { unique: true })
@Index(['tenantId', 'organizationId', 'releasePackageId'])
export class EvolutionAuditEventEntity extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar' })
    auditId: string

    @Column({ type: 'varchar', nullable: true })
    releasePackageId?: string | null

    @Column({ type: 'varchar', nullable: true })
    candidateId?: string | null

    @Column({ type: 'varchar' })
    action: string

    @Column({ type: 'json' })
    value: EvolutionAuditEvent
}

@Entity('agent_evolution_runtime_observation')
@Index(['tenantId', 'organizationId', 'observationId'], { unique: true })
@Index(['tenantId', 'organizationId', 'targetId', 'deploymentId'])
export class EvolutionRuntimeObservationEntity extends EvolutionScopedEntity {
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
    value: EvolutionRuntimeObservation
}

@Entity('agent_evolution_job')
@Index(['tenantId', 'organizationId', 'jobId'], { unique: true })
@Index(['tenantId', 'organizationId', 'resourceId', 'jobType'])
export class EvolutionJobEntity extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar' })
    jobId: string

    @Column({ type: 'varchar' })
    jobType: EvolutionJobType

    @Column({ type: 'varchar' })
    resourceId: string

    @Column({ type: 'varchar' })
    status: EvolutionJobStatus

    @Column({ type: 'json' })
    value: EvolutionJob
}

export const AGENT_EVOLUTION_ENTITIES = [
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
