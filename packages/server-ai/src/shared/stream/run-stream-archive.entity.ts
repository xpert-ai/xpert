import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'

@Entity('run_stream_archive')
@Index(['tenantId', 'threadId', 'runId'], { unique: true })
export class RunStreamArchive extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar' }) threadId: string
    @Column({ type: 'uuid' }) runId: string
    @ManyToOne('XpertAgentExecution', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'runId' })
    execution?: import('@xpert-ai/contracts').IXpertAgentExecution
    @Column({ type: 'varchar' }) cursor: string
    @Column({ type: 'varchar' }) epoch: string
    @Column({ type: 'varchar' }) status: string
    @Column({ type: 'text', nullable: true }) error?: string | null
}

@Entity('run_stream_archived_event')
@Index(['tenantId', 'threadId', 'runId', 'cursor'], { unique: true })
export class RunStreamArchivedEvent extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar' }) threadId: string
    @Column({ type: 'uuid' }) runId: string
    @ManyToOne('XpertAgentExecution', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'runId' })
    execution?: import('@xpert-ai/contracts').IXpertAgentExecution
    @Column({ type: 'varchar' }) cursor: string
    @Column({ type: 'jsonb' }) data: unknown
}
