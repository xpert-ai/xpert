import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import type { ChatConversation } from '../conversation.entity'

// Internal recovery data is not a workspace file or a generic memory-store namespace.
@Entity('chat_context_evidence')
@Index(['evidenceId'], { unique: true })
@Index(['conversationId', 'threadId'])
export class ContextEvidence extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar', length: 64 })
    evidenceId: string

    @ManyToOne('ChatConversation', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'conversationId' })
    conversation?: ChatConversation

    @Column({ type: 'uuid' })
    conversationId: string

    @Column({ type: 'varchar', length: 100 })
    threadId: string

    @Column({ type: 'varchar', length: 255 })
    agentKey: string

    @Column({ type: 'text', select: false })
    payload: string
}
