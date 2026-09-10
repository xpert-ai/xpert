import { TenantBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

export type ModelUsageDeliveryStatus = 'pending' | 'completed'

@Entity('model_usage_delivery_receipt')
@Index('UQ_model_usage_delivery_receipt_request', ['tenantId', 'providerScopeId', 'requestId'], { unique: true })
export class ModelUsageDeliveryReceipt extends TenantBaseEntity {
    @Column({ type: 'varchar', length: 191 })
    providerScopeId: string

    @Column({ type: 'varchar', length: 191 })
    requestId: string

    @Column({ type: 'varchar', length: 64 })
    payloadFingerprint: string

    @Column({ type: 'varchar', length: 20, default: 'pending' })
    status: ModelUsageDeliveryStatus

    @Column({ type: 'timestamptz', nullable: true })
    userRollupDeliveredAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    organizationRollupDeliveredAt?: Date | null

    @Column({ type: 'boolean', default: false })
    userTokenLimitExceeded: boolean

    @Column({ type: 'boolean', default: false })
    organizationTokenLimitExceeded: boolean

    @Column({ type: 'timestamptz', nullable: true })
    completedAt?: Date | null
}
