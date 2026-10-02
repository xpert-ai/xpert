import { Column, Entity, Index } from 'typeorm'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import type { ExecutionReconciliationInput } from './execution-reconciliation.schema'

/** Immutable operator evidence. Applying it reuses the original attempt/payer and usage outbox. */
@Entity('model_execution_reconciliation')
@Index(['tenantId', 'callId'], { unique: true })
export class ModelExecutionReconciliation extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) callId: string
    @Column({ type: 'uuid' }) reviewerId: string
    @Column({ type: 'jsonb' }) evidence: ExecutionReconciliationInput
    @Column({ type: 'timestamptz', nullable: true }) appliedAt: Date | null
}
