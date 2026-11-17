import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type {
    AgentOutputReference,
    NotificationDeliveryState,
    OutputQuietHours,
    AnnouncementInput,
    NotificationOutboxPayload,
    UserNotification
} from '@xpert-ai/contracts'

export abstract class NotificationTenantEntity {
    @PrimaryGeneratedColumn('uuid') id: string
    @Column({ type: 'uuid' }) tenantId: string
    @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date
}

@Entity('announcement')
@Index(['tenantId', 'status', 'startsAt'])
export class AnnouncementEntity extends NotificationTenantEntity {
    @Column({ type: 'varchar', length: 160 }) title: string
    @Column({ type: 'text' }) body: string
    @Column({ type: 'varchar', length: 32 }) category: AnnouncementInput['category']
    @Column({ type: 'varchar', length: 16 }) severity: AnnouncementInput['severity']
    @Column({ type: 'jsonb' }) clients: AnnouncementInput['clients']
    @Column({ type: 'varchar', length: 16, default: 'draft' }) status: 'draft' | 'published' | 'withdrawn'
    @Column({ type: 'int', default: 1 }) revision: number
    @Column({ type: 'timestamptz' }) startsAt: Date
    @Column({ type: 'timestamptz', nullable: true }) expiresAt: Date | null
    @Column({ type: 'jsonb', nullable: true }) action: AnnouncementInput['action']
    @Column({ type: 'uuid' }) authorId: string
    @Column({ type: 'uuid', nullable: true }) publisherId: string | null
}

@Entity('announcement_dismissal')
@Index(['tenantId', 'userId', 'announcementId'], { unique: true })
export class AnnouncementDismissal extends NotificationTenantEntity {
    @Column({ type: 'uuid' }) userId: string
    @Column({ type: 'uuid' }) announcementId: string
}

@Entity('announcement_audit')
export class AnnouncementAudit extends NotificationTenantEntity {
    @Column({ type: 'uuid' }) announcementId: string
    @Column({ type: 'uuid' }) actorId: string
    @Column({ type: 'varchar', length: 16 }) operation: 'create' | 'edit' | 'publish' | 'withdraw'
    @Column({ type: 'int' }) revision: number
    @Column({ type: 'jsonb' }) content: AnnouncementInput
}

@Entity('user_notification')
@Index(['tenantId', 'userId', 'eventKey'], { unique: true })
@Index(['tenantId', 'userId', 'createdAt'])
export class UserNotificationEntity extends NotificationTenantEntity {
    @Column({ type: 'uuid' }) userId: string
    @Column({ type: 'varchar', length: 200 }) eventKey: string
    @Column({ type: 'varchar', length: 32 }) kind: UserNotification['kind']
    @Column({ type: 'jsonb' }) source: UserNotification['source'] & { threadId?: string }
    @Column({ type: 'timestamptz', nullable: true }) readAt: Date | null
}

@Entity('notification_outbox')
@Index(['tenantId', 'eventKey'], { unique: true })
@Index(['state', 'availableAt'])
export class NotificationOutbox extends NotificationTenantEntity {
    @Column({ type: 'uuid', nullable: true }) userId: string | null
    @Column({ type: 'varchar', length: 200 }) eventKey: string
    @Column({ type: 'jsonb' }) payload: NotificationOutboxPayload
    @Column({ type: 'varchar', length: 16, default: 'pending' }) state: 'pending' | 'sent' | 'blocked'
    @Column({ type: 'int', default: 0 }) attempts: number
    @Column({ type: 'timestamptz' }) availableAt: Date
    @Column({ type: 'timestamptz', nullable: true }) leaseUntil: Date | null
    @Column({ type: 'uuid', nullable: true }) leaseId: string | null
    @Column({ type: 'timestamptz', nullable: true }) sentAt: Date | null
    @Column({ type: 'varchar', length: 64, nullable: true }) lastError: string | null
}

/** Durable handoff of one plugin result to one recipient. Retries reuse this message across channels. */
@Entity('agent_output_message')
@Index('uq_agent_output_message', ['tenantId', 'organizationId', 'plugin', 'kind', 'outputKey', 'userId'], {
    unique: true
})
export class AgentOutputMessage extends NotificationTenantEntity {
    @Column('uuid') organizationId: string
    @Column('uuid') userId: string
    @Column('uuid') bindingId: string
    @Column('int') bindingRevision: number
    @Column('varchar') plugin: string
    @Column('varchar') kind: string
    @Column('varchar') outputKey: string
    @Column('jsonb') reference: AgentOutputReference
}

/** Recipient settings for one output kind and channel. The revision fences queued deliveries after a target change. */
@Entity('agent_output_preference')
@Index('uq_agent_output_preference', ['tenantId', 'organizationId', 'userId', 'kind', 'channel'], { unique: true })
export class AgentOutputPreference extends NotificationTenantEntity {
    @Column('uuid') organizationId: string
    @Column('uuid') userId: string
    @Column('varchar') kind: string
    @Column('varchar') channel: 'in_app' | 'lark'
    @Column('boolean') enabled: boolean
    @Column('int') revision: number
    @Column('timestamptz') enabledSince: Date
    @Column({ type: 'jsonb', nullable: true }) quiet: OutputQuietHours | null
    @Column({ type: 'uuid', nullable: true }) integrationId: string | null
    @Column({ type: 'varchar', nullable: true }) targetDigest: string | null
}

/** One channel attempt or pending batch. Persist attemptId before calling the provider so recovery can detect an uncertain send. */
@Entity('agent_output_delivery')
@Index(
    'uq_agent_output_decision_message',
    ['tenantId', 'organizationId', 'decisionIntegrationId', 'decisionAppId', 'providerMessageId'],
    { unique: true, where: '"decisionIntegrationId" IS NOT NULL' }
)
@Index('ix_agent_output_batch', ['groupKey', 'state'])
export class AgentOutputDelivery extends NotificationTenantEntity {
    @Column('uuid') organizationId: string
    @Column('uuid') userId: string
    @Column('varchar') channel: AgentOutputPreference['channel']
    @Column('varchar') kind: string
    @Column('varchar') groupKey: string
    @Column('int') preferenceRevision: number
    @Column('varchar') state: NotificationDeliveryState
    @Column({ type: 'uuid', nullable: true }) attemptId: string | null
    @Column({ type: 'timestamptz', nullable: true }) attemptedAt: Date | null
    @Column({ type: 'uuid', nullable: true }) decisionIntegrationId: string | null
    @Column({ type: 'varchar', nullable: true }) decisionAppId: string | null
    @Column({ type: 'varchar', nullable: true }) decisionChatDigest: string | null
    @Column({ type: 'jsonb', nullable: true }) decisionRoute: {
        memberId: string
        fingerprint: string
        decision: import('@xpert-ai/contracts').HumanDecision
    } | null
    @Column({ type: 'varchar', nullable: true }) providerMessageId: string | null
    @Column({ type: 'varchar', nullable: true }) reason: string | null
}

/** Assigns a message to one batch per channel. Inclusion is frozen at dispatch; reads still recheck current access. */
@Entity('agent_output_member')
@Index('uq_agent_output_member', ['messageId', 'channel'], { unique: true })
@Index('ix_agent_output_members', ['deliveryId'])
export class AgentOutputMember extends NotificationTenantEntity {
    @Column('uuid') messageId: string
    @Column('uuid') deliveryId: string
    @Column('varchar') channel: AgentOutputPreference['channel']
    @Column('boolean', { default: true }) included: boolean
}

export const USER_NOTIFICATION_ENTITIES = [
    AgentOutputMessage,
    AgentOutputPreference,
    AgentOutputDelivery,
    AgentOutputMember,
    AnnouncementEntity,
    AnnouncementDismissal,
    AnnouncementAudit,
    UserNotificationEntity,
    NotificationOutbox
]
