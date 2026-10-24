import type { TRunDisplaySnapshot } from '@xpert-ai/contracts'
import type { ChatConversationThread } from '../../../chat-conversation/conversation-thread.entity'
import type { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { Column, Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm'

/** Internal projection; public reads go through authorized run streams. */
@Entity('chat_run_display_snapshot')
export class RunDisplaySnapshotEntity {
    @PrimaryColumn({ type: 'varchar', length: 100 })
    threadId: string
    @PrimaryColumn({ type: 'uuid' })
    runId: string
    @ManyToOne('ChatConversationThread', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'threadId', referencedColumnName: 'threadId' })
    thread?: ChatConversationThread
    @ManyToOne('XpertAgentExecution', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'runId' })
    run?: XpertAgentExecution
    @Column({ type: 'uuid' })
    tenantId: string
    @Column({ type: 'uuid', nullable: true })
    organizationId: string | null
    @Column({ type: 'uuid' })
    segmentId: string
    @Column({ type: 'int', default: 0 })
    revision: number
    @Column({ type: 'varchar', nullable: true })
    cursor: string | null
    @Column({ type: 'jsonb', nullable: true })
    snapshot: TRunDisplaySnapshot | null
    @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    savedAt: Date
}
