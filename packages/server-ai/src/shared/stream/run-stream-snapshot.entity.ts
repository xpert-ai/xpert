import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import type { RunStreamSnapshotPayload } from './run-stream-snapshot.schema'

@Entity('run_stream_snapshot')
@Index(['tenantId', 'threadId', 'runId'], { unique: true })
export class RunStreamSnapshot extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar' }) threadId: string
    @Column({ type: 'uuid' }) runId: string
    @ManyToOne('XpertAgentExecution', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'runId' })
    execution?: import('@xpert-ai/contracts').IXpertAgentExecution
    @Column({ type: 'varchar' }) epoch: string
    @Column({ type: 'varchar' }) cursor: string
    @Column({ type: 'int', default: 1 }) revision: number
    @Column({ type: 'jsonb' }) payload: RunStreamSnapshotPayload
}
