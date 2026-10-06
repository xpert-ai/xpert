import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'
import type {
    AgentRuntimeConsumptionState,
    AgentRuntimeDeliveryState,
    AgentRuntimeEvent,
    AgentRuntimeResultClaim
} from '@xpert-ai/plugin-sdk'

/** Transport receipts reference Invocation facts; they never own an executor's status or result. */
@Entity('agent_runtime_delivery')
@Index(['messageId'], { unique: true })
@Index(['state', 'nextAttemptAt'])
export class AgentRuntimeDelivery extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar' }) messageId: string
    @Column({ type: 'uuid' }) invocationId: string
    @Column({ type: 'varchar' }) ownerId: string
    @Column({ type: 'jsonb' }) event: AgentRuntimeEvent
    @Column({ type: 'varchar', default: 'pending' }) state: AgentRuntimeDeliveryState
    @Column({ type: 'int', default: 0 }) attempts: number
    @Column({ type: 'timestamptz', default: () => 'now()' }) nextAttemptAt: Date
    @Column({ type: 'uuid', nullable: true }) leaseToken: string | null
    @Column({ type: 'timestamptz', nullable: true }) leaseUntil: Date | null
    @Column({ type: 'varchar', nullable: true }) lastError: string | null
}

@Entity('agent_runtime_inbox')
@Index(['tenantId', 'organizationId', 'ownerId', 'consumptionKey'], { unique: true })
@Index(['state', 'nextAttemptAt'])
export class AgentRuntimeInbox extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar' }) consumptionKey: string
    @Column({ type: 'varchar' }) messageId: string
    @Column({ type: 'uuid' }) invocationId: string
    @Column({ type: 'varchar' }) ownerId: string
    @Column({ type: 'jsonb' }) event: AgentRuntimeEvent
    @Column({ type: 'varchar', default: 'pending' }) state: AgentRuntimeConsumptionState
    @Column({ type: 'jsonb', nullable: true }) claim: AgentRuntimeResultClaim | null
    @Column({ type: 'varchar', nullable: true }) phase: 'reserved' | 'started' | null
    @Column({ type: 'timestamptz', default: () => 'now()' }) nextAttemptAt: Date
    @Column({ type: 'uuid', nullable: true }) leaseToken: string | null
    @Column({ type: 'timestamptz', nullable: true }) leaseUntil: Date | null
    @Column({ type: 'varchar', nullable: true }) lastError: string | null
    @Column({ type: 'int', default: 0 }) attempts: number
}
