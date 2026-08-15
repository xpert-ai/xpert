import type {
    IModelInvocation,
    ModelInvocationArtifactState,
    ModelInvocationModality,
    ModelInvocationOperation,
    ModelInvocationOriginType,
    ModelInvocationPricingDimensions,
    ModelInvocationPricingSnapshot,
    ModelInvocationProviderState,
    ModelInvocationReconciliationState,
    ModelInvocationUsageAvailability,
    ModelInvocationRawUsage,
    ModelUsageMetric
} from '@xpert-ai/contracts'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

@Entity('model_invocation')
@Index('UQ_model_invocation_origin_key', ['tenantId', 'originType', 'originId', 'invocationKey'], { unique: true })
@Index('UQ_model_invocation_provider_task', ['tenantId', 'providerScopeId', 'providerRequestId'], {
    unique: true,
    where: '"providerRequestId" IS NOT NULL'
})
@Index('IDX_model_invocation_execution', ['tenantId', 'originExecutionId', 'createdAt'])
@Index('IDX_model_invocation_reconcile', ['reconciliationState', 'nextReconcileAt'])
export class ModelInvocation extends TenantOrganizationBaseEntity implements IModelInvocation {
    @Column({ type: 'varchar', length: 191 })
    invocationKey: string

    @Column({ type: 'varchar', length: 20 })
    originType: ModelInvocationOriginType

    @Column({ type: 'varchar', length: 191 })
    originId: string

    @Column({ type: 'uuid', nullable: true })
    originExecutionId?: string | null

    @Column({ type: 'uuid', nullable: true })
    userId?: string | null

    @Column({ type: 'varchar', nullable: true, length: 100 })
    agentKey?: string | null

    @Column({ type: 'uuid' })
    toolsetId: string

    @Column({ type: 'varchar', length: 191 })
    providerScopeId: string

    @Column({ type: 'uuid' })
    copilotId: string

    @Column({ type: 'varchar', length: 100 })
    provider: string

    @Column({ type: 'varchar', length: 20 })
    modelType: AiModelTypeEnum

    @Column({ type: 'varchar', nullable: true })
    model?: string | null

    @Column({ type: 'varchar', length: 191 })
    toolName: string

    @Column({ type: 'varchar', length: 100 })
    operation: ModelInvocationOperation

    @Column({ type: 'varchar', length: 20 })
    modality: ModelInvocationModality

    @Column({ type: 'varchar', nullable: true })
    providerRequestId?: string | null

    @Column({ type: 'varchar', length: 20, default: 'started' })
    providerState: ModelInvocationProviderState

    @Column({ type: 'varchar', length: 20, default: 'pending' })
    usageAvailability: ModelInvocationUsageAvailability

    @Column({ type: 'json', nullable: true })
    metrics?: ModelUsageMetric[] | null

    @Column({ type: 'json', nullable: true })
    pricingDimensions?: ModelInvocationPricingDimensions | null

    @Column({ type: 'json', nullable: true })
    pricingSnapshot?: ModelInvocationPricingSnapshot | null

    @Column({ type: 'json', nullable: true })
    rawUsage?: ModelInvocationRawUsage | null

    @Column({ type: 'varchar', length: 20, default: 'pending' })
    artifactState: ModelInvocationArtifactState

    @Column({ type: 'varchar', nullable: true, length: 100 })
    artifactErrorCode?: string | null

    @Column({ type: 'varchar', length: 20, default: 'ready' })
    reconciliationState: ModelInvocationReconciliationState

    @Column({ type: 'timestamptz', nullable: true })
    nextReconcileAt?: Date | null

    @Column({ type: 'int', default: 0 })
    reconcileAttempts: number

    @Column({ type: 'varchar', nullable: true, length: 100 })
    reconciliationErrorCode?: string | null

    @Column({ type: 'timestamptz' })
    startedAt: Date

    @Column({ type: 'timestamptz', nullable: true })
    completedAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    lastObservedAt?: Date | null

    @Column({ type: 'varchar', nullable: true, length: 100 })
    errorCode?: string | null
}
