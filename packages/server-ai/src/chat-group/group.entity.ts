import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import type { IGroupInteraction, IGroupMessageRecipient, IGroupParticipant, IGroupSession } from '@xpert-ai/contracts'
import { Column, Entity, Index } from 'typeorm'

@Entity('chat_group_participant')
@Index(['groupId', 'kind', 'subjectId'], { unique: true })
export class GroupParticipant extends TenantOrganizationBaseEntity implements IGroupParticipant {
    @Column({ type: 'uuid' }) groupId: string
    @Column({ type: 'varchar' }) kind: IGroupParticipant['kind']
    @Column({ type: 'uuid' }) subjectId: string
    @Column({ type: 'varchar' }) name: string
    @Column({ type: 'varchar', default: 'member' }) role: IGroupParticipant['role']
    @Column({ type: 'boolean', default: true }) active: boolean
    @Column({ type: 'uuid', nullable: true }) runtimeConversationId?: string
    @Column({ type: 'uuid', nullable: true }) runtimeThreadId?: string
    @Column({ type: 'uuid', nullable: true }) principalUserId?: string
    @Column({ type: 'int', default: 0 }) contextSequence: number
    @Column({ type: 'int', default: 0 }) readSequence: number
    @Column({ type: 'boolean', default: false }) pinned: boolean
    @Column({ type: 'boolean', default: false }) archived: boolean
}

/** Business delivery/consumption receipts. Handoff remains the sole execution queue. */
@Entity('chat_message_recipient')
@Index(['messageId', 'participantId'], { unique: true })
@Index(['status', 'nextAttemptAt'])
export class GroupMessageRecipient extends TenantOrganizationBaseEntity implements IGroupMessageRecipient {
    @Column({ type: 'uuid' }) groupId: string
    @Column({ type: 'uuid' }) messageId: string
    @Column({ type: 'uuid' }) participantId: string
    @Column({ type: 'varchar', default: 'pending' }) status: IGroupMessageRecipient['status']
    @Column({ type: 'boolean', default: false }) wake: boolean
    @Column({ type: 'uuid', nullable: true }) replyMessageId?: string | null
    @Column({ type: 'uuid', nullable: true }) executionId?: string | null
    @Column({ type: 'uuid', nullable: true }) inputMessageId?: string | null
    @Column({ type: 'varchar', nullable: true }) phase?: IGroupMessageRecipient['phase']
    @Column({ type: 'varchar', nullable: true }) error?: string | null
    @Column({ type: 'int', default: 0 }) attempts: number
    @Column({ type: 'int', default: 0 }) contextSequence: number
    @Column({ type: 'timestamptz', default: () => 'now()' }) nextAttemptAt: Date
    @Column({ type: 'timestamptz', nullable: true }) startedAt?: Date | null
    @Column({ type: 'uuid', nullable: true }) leaseToken?: string | null
    @Column({ type: 'timestamptz', nullable: true }) leaseUntil?: Date | null
    @Column({ type: 'jsonb', nullable: true }) control?: IGroupMessageRecipient['control']
}

@Entity('chat_group_session')
@Index(['tokenHash'], { unique: true })
export class GroupSession extends TenantOrganizationBaseEntity implements IGroupSession {
    @Column({ type: 'uuid' }) groupId: string
    @Column({ type: 'uuid' }) userId: string
    @Column({ type: 'varchar' }) tokenHash: string
    @Column({ type: 'timestamptz' }) expiresAt: Date
}

@Entity('chat_group_interaction')
@Index(['groupId', 'interactionId'], { unique: true })
export class GroupInteraction extends TenantOrganizationBaseEntity implements IGroupInteraction {
    @Column({ type: 'uuid' }) groupId: string
    @Column({ type: 'varchar' }) interactionId: string
    @Column({ type: 'uuid' }) participantId: string
    @Column({ type: 'uuid' }) assignedUserId: string
    @Column({ type: 'uuid', nullable: true }) claimedBy?: string | null
    @Column({ type: 'varchar', default: 'pending' }) status: IGroupInteraction['status']
    @Column({ type: 'uuid' }) recipientId: string
    @Column({ type: 'uuid' }) runId: string
    @Column({ type: 'uuid', nullable: true }) claimId?: string | null
    @Column({ type: 'jsonb' }) payload: unknown
}
