import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { AnnouncementInput, NotificationOutboxPayload, UserNotification } from '@xpert-ai/contracts'

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
    @Column({ type: 'varchar', length: 32 }) kind: 'agent.completed'
    @Column({ type: 'jsonb' }) source: UserNotification['source']
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

export const USER_NOTIFICATION_ENTITIES = [
    AnnouncementEntity,
    AnnouncementDismissal,
    AnnouncementAudit,
    UserNotificationEntity,
    NotificationOutbox
]
