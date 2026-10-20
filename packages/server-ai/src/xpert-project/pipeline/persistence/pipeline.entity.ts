import type { PipelineRuntimeIntent } from '../runtime/pipeline-runtime-intent.schema'
import { Column, Entity, Index } from 'typeorm'
import type {
    ProjectPipelineBinding,
    ProjectPipelineDefinition,
    ProjectPipelineProjection,
    ProjectPipelineProjectionNode,
    ProjectPipelineProjectionEdge,
    ProjectPipelineSubjectVersion,
    ProjectPipelineRefreshStatus,
    ProjectPipelineOperationReceipt,
    ProjectPipelineCompletionReceipt,
    ProjectPipelineEvidenceRef,
    ProjectPipelineProviderActionCommand,
    ProjectPipelineProviderActionReceipt,
    ProjectPipelineProviderActionView,
    PipelineHumanWaitSnapshot,
    ProjectPipelineResourceReservation,
    ProjectPipelineNativeModelBudget
} from '@xpert-ai/contracts'
import type { ProjectPipelineOperationContext } from '@xpert-ai/plugin-sdk'
import type { PipelineAssistantIntent } from '../runtime/pipeline-assistant-intent.schema'
import { XpertProjectBaseEntity } from '../../entities/project.base'

export abstract class ProjectPipelineBaseEntity extends XpertProjectBaseEntity {
    @Column({ type: 'uuid' }) projectId: string
    @Column({ type: 'uuid' }) tenantId: string
    @Column({ type: 'uuid', nullable: true }) organizationId: string | null
}

@Entity('xpert_project_pipeline_definition')
@Index(['projectId', 'ownerRef', 'templateKey', 'version'], { unique: true })
export class ProjectPipelineDefinitionEntity extends ProjectPipelineBaseEntity {
    @Column({ type: 'varchar' }) ownerRef: string
    @Column({ type: 'varchar' }) templateKey: string
    @Column({ type: 'varchar' }) version: string
    @Column({ type: 'varchar' }) digest: string
    @Column({ type: 'jsonb' }) definition: ProjectPipelineDefinition
}

@Entity('xpert_project_pipeline_binding')
export class ProjectPipelineBindingEntity extends ProjectPipelineBaseEntity {
    @Column({ type: 'uuid' }) definitionId: string
    @Column({ type: 'int', default: 1 }) revision: number
    @Column({ type: 'jsonb' }) configuration: ProjectPipelineBinding
}

@Entity('xpert_project_pipeline_instance')
@Index(['projectId', 'ownerRef', 'sourceKey'], { unique: true })
export class ProjectPipelineInstanceEntity extends ProjectPipelineBaseEntity {
    @Column({ type: 'varchar' }) ownerRef: string
    @Column({ type: 'varchar' }) sourceKey: string
    @Column({ type: 'varchar' }) authority: 'provider' | 'platform'
    @Column({ type: 'varchar' }) title: string
    @Column({ type: 'uuid' }) definitionId: string
    @Column({ type: 'jsonb' }) subject: ProjectPipelineProjection['subject']
    @Column({ type: 'uuid', nullable: true }) currentRunId: string | null
    @Column({ type: 'uuid', nullable: true }) currentRoundId: string | null
    @Column({ type: 'uuid', nullable: true }) sourceEpoch: string | null
    @Column({ type: 'bigint', nullable: true }) sourceSequence: string | null
    @Column({ type: 'varchar', nullable: true }) snapshotDigest: string | null
    @Column({ type: 'int', default: 0 }) revision: number
    @Column({ type: 'jsonb', nullable: true }) nativeModelBudget: ProjectPipelineNativeModelBudget | null
}

@Entity('xpert_project_pipeline_run')
@Index(['instanceId', 'sourceKey'], { unique: true })
export class ProjectPipelineRunEntity extends ProjectPipelineBaseEntity {
    @Column({ type: 'uuid' }) instanceId: string
    @Column({ type: 'varchar' }) sourceKey: string
    @Column({ type: 'uuid' }) definitionId: string
    @Column({ type: 'jsonb', nullable: true }) bindingSnapshot: ProjectPipelineBinding | null
    @Column({ type: 'varchar' }) state: ProjectPipelineProjection['run']['state']
}

@Entity('xpert_project_pipeline_round')
@Index(['runId', 'sequence'], { unique: true })
@Index(['runId', 'sourceKey'], { unique: true })
export class ProjectPipelineRoundEntity extends ProjectPipelineBaseEntity {
    @Column({ type: 'uuid' }) runId: string
    @Column({ type: 'varchar' }) sourceKey: string
    @Column({ type: 'int' }) sequence: number
    @Column({ type: 'int' }) generation: number
    @Column({ type: 'varchar' }) inputDigest: string
    @Column({ type: 'jsonb' }) subjectVersionSet: ProjectPipelineSubjectVersion[]
    @Column({ type: 'varchar' }) state: ProjectPipelineProjection['round']['state']
    @Column({ type: 'jsonb', default: '[]' }) edges: ProjectPipelineProjectionEdge[]
    @Column({ type: 'jsonb', nullable: true }) projectionTasks: ProjectPipelineProjection['tasks'] | null
}

@Entity('xpert_project_pipeline_node')
@Index(['roundId', 'sourceKey'], { unique: true })
@Index(['roundId', 'nodeKey', 'expansionKey'], { unique: true })
export class ProjectPipelineNodeEntity extends ProjectPipelineBaseEntity {
    @Column({ type: 'uuid' }) roundId: string
    @Column({ type: 'varchar' }) sourceKey: string
    @Column({ type: 'varchar' }) nodeKey: string
    @Column({ type: 'varchar' }) expansionKey: string
    @Column({ type: 'varchar', default: 'active' }) disposition: 'active' | 'removed' | 'excluded' | 'superseded'
    @Column({ type: 'jsonb' }) projection: ProjectPipelineProjectionNode
    @Column({ type: 'jsonb', default: '[]' }) taskIds: string[]
}

@Entity('xpert_project_pipeline_event')
@Index(['instanceId', 'revision'], { unique: true })
export class ProjectPipelineEventEntity extends ProjectPipelineBaseEntity {
    @Column({ type: 'uuid' }) instanceId: string
    @Column({ type: 'int' }) revision: number
    @Column({ type: 'varchar' }) type:
        | 'projection.applied'
        | 'round.advanced'
        | 'operation.observed'
        | 'decision.recorded'
        | 'run.cancel_requested'
        | 'run.retry_requested'
        | 'run.cancelled'
        | 'model.admission_denied'
    @Column({ type: 'jsonb' }) payload: {
        sourceEpoch?: string
        sourceSequence?: number
        snapshotDigest?: string
        roundId: string
        operationId?: string
        runId?: string
        digest?: string
        humanWaitSnapshot?: PipelineHumanWaitSnapshot
    }
}

@Entity('xpert_project_pipeline_task_link')
@Index(['nodeInstanceId', 'taskId'], { unique: true })
export class ProjectPipelineTaskLinkEntity extends ProjectPipelineBaseEntity {
    @Column({ type: 'uuid' }) nodeInstanceId: string
    @Column({ type: 'uuid' }) taskId: string
    @Column({ type: 'varchar', default: 'primary' }) relation: 'primary' | 'summary'
}

@Entity('xpert_project_pipeline_refresh')
@Index(['projectId', 'ownerRef', 'sourceKey'], { unique: true })
export class ProjectPipelineRefreshEntity extends ProjectPipelineBaseEntity {
    @Column({ type: 'varchar' }) ownerRef: string
    @Column({ type: 'varchar' }) sourceKey: string
    @Column({ type: 'uuid' }) requestId: string
    @Column({ type: 'varchar' }) state: ProjectPipelineRefreshStatus['state']
    @Column({ type: 'varchar', nullable: true }) errorCode: string | null
}

/** The queued row is the durable dispatch outbox. Expired claims may only inspect the original operation. */
@Entity('xpert_project_pipeline_operation')
@Index(['nodeInstanceId', 'attempt'], { unique: true })
export class ProjectPipelineOperationEntity extends ProjectPipelineBaseEntity {
    @Column({ type: 'uuid' }) instanceId: string
    @Column({ type: 'uuid' }) runId: string
    @Column({ type: 'uuid' }) roundId: string
    @Column({ type: 'uuid' }) nodeInstanceId: string
    @Column({ type: 'int' }) attempt: number
    @Column({ type: 'varchar' }) kind: 'operation' | 'policy' | 'subscription'
    @Column({ type: 'varchar' }) handlerRef: string
    @Column({ type: 'varchar', nullable: true }) completionRef: string | null
    @Column({ type: 'varchar' }) snapshotDigest: string
    @Column({ type: 'jsonb' }) context: ProjectPipelineOperationContext
    @Column({ type: 'jsonb', nullable: true }) resourceReservation: ProjectPipelineResourceReservation | null
    @Column({ type: 'varchar' }) state:
        | 'queued'
        | 'dispatching'
        | 'pending'
        | 'unknown'
        | 'succeeded'
        | 'failed'
        | 'accepted'
        | 'rejected'
        | 'cancelled'
        | 'superseded'
    @Column({ type: 'jsonb', nullable: true }) receipt: ProjectPipelineOperationReceipt | null
    @Column({ type: 'jsonb', nullable: true }) completion: ProjectPipelineCompletionReceipt | null
    @Column({ type: 'uuid', nullable: true }) leaseOwner: string | null
    @Column({ type: 'int', default: 0 }) leaseFence: number
    @Column({ type: 'timestamptz', nullable: true }) leaseExpiresAt: Date | null
    @Column({ type: 'timestamptz' }) nextCheckAt: Date
    @Column({ type: 'timestamptz', nullable: true }) dispatchStartedAt: Date | null
    @Column({ type: 'timestamptz', nullable: true }) terminalObservedAt: Date | null
    @Column({ type: 'timestamptz', nullable: true }) cancelRequestedAt: Date | null
    @Column({ type: 'timestamptz', nullable: true }) cancelDispatchedAt: Date | null
    /** Server-only prepared native request. Graph APIs expose only authorized runtime references. */
    @Column({ type: 'jsonb', nullable: true, select: false }) assistantIntent: PipelineAssistantIntent | null
    @Column({ type: 'jsonb', nullable: true, select: false }) runtimeIntent: PipelineRuntimeIntent | null
}

@Entity('xpert_project_pipeline_decision')
@Index(['nodeInstanceId', 'generation'], { unique: true })
export class ProjectPipelineDecisionEntity extends ProjectPipelineBaseEntity {
    @Column({ type: 'uuid' }) nodeInstanceId: string
    @Column({ type: 'uuid' }) roundId: string
    @Column({ type: 'uuid' }) operationId: string
    @Column({ type: 'varchar' }) kind: 'policy' | 'human'
    @Column({ type: 'varchar' }) policyRef: string
    @Column({ type: 'varchar' }) inputDigest: string
    @Column({ type: 'int' }) generation: number
    @Column({ type: 'varchar' }) outcome: string
    @Column({ type: 'jsonb' }) evidence: ProjectPipelineEvidenceRef[]
    @Column({ type: 'uuid' }) actorId: string
}

@Entity('xpert_project_pipeline_attention')
@Index(['nodeInstanceId', 'kind'], { unique: true })
export class ProjectPipelineAttentionEntity extends ProjectPipelineBaseEntity {
    @Column({ type: 'uuid' }) instanceId: string
    @Column({ type: 'uuid' }) nodeInstanceId: string
    @Column({ type: 'uuid' }) roundId: string
    @Column({ type: 'varchar' }) kind: 'human' | 'blocked' | 'unknown'
    @Column({ type: 'varchar' }) state: 'open' | 'resolved' | 'superseded'
    @Column({ type: 'int', default: 1 }) revision: number
    @Column({ type: 'varchar' }) reasonCode: string
    @Column({ type: 'varchar' }) inputDigest: string
    @Column({ type: 'int' }) generation: number
    @Column({ type: 'varchar', nullable: true }) policyRef: string | null
    @Column({ type: 'varchar', nullable: true }) candidateRoleKey: string | null
    @Column({ type: 'jsonb', default: '[]' }) outcomes: string[]
    @Column({ type: 'uuid', nullable: true }) decisionId: string | null
}

/** Domain actions have their own outbox; they never enter the platform DAG coordinator. */
@Entity('xpert_project_pipeline_provider_action')
export class ProjectPipelineProviderActionEntity extends ProjectPipelineBaseEntity {
    @Column({ type: 'uuid' }) instanceId: string
    @Column({ type: 'uuid' }) runId: string
    @Column({ type: 'uuid' }) roundId: string
    @Column({ type: 'uuid' }) nodeInstanceId: string
    @Column({ type: 'varchar' }) providerRef: string
    @Column({ type: 'varchar' }) sourceKey: string
    @Column({ type: 'varchar' }) digest: string
    @Column({ type: 'jsonb' }) input: ProjectPipelineProviderActionCommand
    @Column({ type: 'jsonb' }) node: ProjectPipelineProjectionNode
    @Column({ type: 'varchar' }) state: ProjectPipelineProviderActionView['state']
    @Column({ type: 'jsonb', nullable: true }) receipt: ProjectPipelineProviderActionReceipt | null
    @Column({ type: 'varchar', nullable: true }) reasonCode: string | null
    @Column({ type: 'uuid', nullable: true }) leaseOwner: string | null
    @Column({ type: 'int', default: 0 }) leaseFence: number
    @Column({ type: 'timestamptz', nullable: true }) leaseExpiresAt: Date | null
    @Column({ type: 'timestamptz', nullable: true }) dispatchStartedAt: Date | null
    @Column({ type: 'timestamptz' }) nextCheckAt: Date
    @Column({ type: 'boolean', default: false }) projectionPending: boolean
}

/** Never expire or release a reservation merely because its worker or model callback disappeared. */
@Entity('xpert_project_pipeline_model_reservation')
@Index(['operationId', 'requestId'], { unique: true })
export class ProjectPipelineModelReservationEntity extends ProjectPipelineBaseEntity {
    @Column({ type: 'uuid' }) instanceId: string
    @Column({ type: 'uuid' }) operationId: string
    @Column({ type: 'uuid' }) executionId: string
    @Column({ type: 'uuid' }) requestId: string
    @Column({ type: 'varchar' }) state: 'held' | 'settled'
    @Column({ type: 'bigint' }) reservedTokens: string
    @Column({ type: 'bigint', nullable: true }) actualTokens: string | null
}

/** Exact host-authorized native identity for a provider action; never inferred from domain correlation fields. */
@Entity('xpert_project_pipeline_native_grant')
@Index(['providerActionId', 'callKey'], { unique: true })
@Index(['executionId'], { unique: true })
export class ProjectPipelineNativeGrantEntity extends ProjectPipelineBaseEntity {
    @Column({ type: 'uuid' }) instanceId: string
    @Column({ type: 'uuid' }) runId: string
    @Column({ type: 'uuid' }) roundId: string
    @Column({ type: 'uuid' }) nodeInstanceId: string
    @Column({ type: 'uuid' }) providerActionId: string
    @Column({ type: 'varchar' }) callKey: string
    @Column({ type: 'uuid' }) leaseOwner: string
    @Column({ type: 'int' }) leaseFence: number
    @Column({ type: 'uuid' }) executionId: string
    @Column({ type: 'uuid' }) conversationId: string
    @Column({ type: 'uuid' }) xpertId: string
    @Column({ type: 'uuid' }) workspaceId: string
    @Column({ type: 'varchar' }) publishedVersion: string
    @Column({ type: 'varchar' }) inputDigest: string
    @Column({ type: 'timestamptz', nullable: true }) consumedAt: Date | null
}

export const ProjectPipelineEntities = [
    ProjectPipelineDefinitionEntity,
    ProjectPipelineBindingEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineEventEntity,
    ProjectPipelineTaskLinkEntity,
    ProjectPipelineRefreshEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineDecisionEntity,
    ProjectPipelineAttentionEntity,
    ProjectPipelineProviderActionEntity,
    ProjectPipelineModelReservationEntity,
    ProjectPipelineNativeGrantEntity
]
