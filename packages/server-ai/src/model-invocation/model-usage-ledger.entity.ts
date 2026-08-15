import type {
    IModelUsageLedger,
    ModelInvocationModality,
    ModelInvocationOperation,
    ModelInvocationOriginType,
    ModelUsageLedgerStatus,
    ModelUsageMetric
} from '@xpert-ai/contracts'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, OneToOne } from 'typeorm'
import { ModelChargeLedger } from './model-charge-ledger.entity'

const numberTransformer = {
    to: (value?: number | null) => value,
    from: (value: string | null) => (value === null ? null : Number(value))
}

@Entity('model_usage_ledger')
@Index('UQ_model_usage_ledger_invocation_unit_revision', ['invocationId', 'unit', 'revision'], { unique: true })
@Index('IDX_model_usage_ledger_scope_recorded', ['tenantId', 'organizationId', 'recordedAt'])
@Index('IDX_model_usage_ledger_provider_model', ['tenantId', 'provider', 'model', 'recordedAt'])
export class ModelUsageLedger extends TenantOrganizationBaseEntity implements IModelUsageLedger {
    @Column({ type: 'uuid' })
    invocationId: string

    @Column({ type: 'int', default: 1 })
    revision: number

    @Column({ type: 'uuid', nullable: true })
    userId?: string | null

    @Column({ type: 'varchar', length: 20 })
    originType: ModelInvocationOriginType

    @Column({ type: 'varchar', length: 191 })
    originId: string

    @Column({ type: 'uuid', nullable: true })
    originExecutionId?: string | null

    @Column({ type: 'uuid' })
    copilotId: string

    @Column({ type: 'varchar', length: 191 })
    providerScopeId: string

    @Column({ type: 'varchar', length: 100 })
    provider: string

    @Column({ type: 'varchar', nullable: true })
    model?: string | null

    @Column({ type: 'varchar', length: 20 })
    modelType: AiModelTypeEnum

    @Column({ type: 'varchar', length: 20 })
    modality: ModelInvocationModality

    @Column({ type: 'varchar', length: 100 })
    operation: ModelInvocationOperation

    @Column({ type: 'varchar', length: 20 })
    unit: ModelUsageMetric['unit']

    @Column({ type: 'varchar', length: 20 })
    authority: ModelUsageMetric['authority']

    @Column({ type: 'numeric', precision: 20, scale: 6, nullable: true, transformer: numberTransformer })
    quantity?: number | null

    @Column({ type: 'bigint', nullable: true, transformer: numberTransformer })
    promptTokens?: number | null

    @Column({ type: 'bigint', nullable: true, transformer: numberTransformer })
    completionTokens?: number | null

    @Column({ type: 'bigint', nullable: true, transformer: numberTransformer })
    totalTokens?: number | null

    @Column({ type: 'varchar', length: 20, default: 'recorded' })
    status: ModelUsageLedgerStatus

    @Column({ type: 'timestamptz' })
    recordedAt: Date

    @OneToOne(() => ModelChargeLedger, (charge) => charge.usageLedger)
    charge?: ModelChargeLedger | null
}
