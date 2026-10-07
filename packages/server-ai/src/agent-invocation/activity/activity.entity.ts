import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'
import type { ExecutionActivityGap, ExecutionActivityItem } from '@xpert-ai/contracts'

@Entity('agent_invocation_activity_state')
export class InvocationActivityState extends TenantOrganizationBaseEntity {
    @Column({ type: 'int', default: 0 }) seq: number
    @Column({ type: 'int', default: 0 }) bytes: number
    @Column({ type: 'varchar', nullable: true }) sourceCursor: string | null
    @Column({ type: 'boolean', default: false }) closed: boolean
    @Column({ type: 'timestamptz', nullable: true }) expiresAt: Date | null
    @Column({ type: 'boolean', default: false }) expired: boolean
    @Column({ type: 'jsonb', default: [] }) gaps: ExecutionActivityGap[]
}

@Entity('agent_invocation_activity_item')
@Index(['invocationId', 'seq'], { unique: true })
@Index(['invocationId', 'itemId', 'seq'])
export class InvocationActivityItem extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) invocationId: string
    @Column({ type: 'int' }) seq: number
    @Column({ type: 'int' }) firstSeq: number
    @Column({ type: 'varchar' }) itemId: string
    @Column({ type: 'varchar' }) hash: string
    @Column({ type: 'jsonb' }) item: ExecutionActivityItem
}
