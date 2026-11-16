import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, ForeignKey, Index, Unique } from 'typeorm'
import { AgentEventBinding } from './agent-event.entity'

@Entity('agent_follow_up_timer')
@ForeignKey(() => AgentEventBinding, ['binding', 'tenantId', 'organizationId'], ['id', 'tenantId', 'organizationId'])
@Unique(['binding', 'requestKey'])
@Index(['binding', 'revision', 'state', 'dueAt'])
export class FollowUpTimer extends TenantOrganizationBaseEntity {
    @Column('uuid') binding: string
    @Column('integer') revision: number
    @Column('varchar', { length: 256 }) requestKey: string
    @Column('varchar', { length: 100 }) threadId: string
    @Column('varchar', { nullable: true }) agentKey: string | null
    @Column('timestamptz') dueAt: Date
    @Column('text') purpose: string
    @Column('varchar', { length: 16, default: 'waiting' }) state: 'waiting' | 'published' | 'cancelled' | 'fired'
}
