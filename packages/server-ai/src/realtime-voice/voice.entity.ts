import type { ModelUsagePricingSnapshot, RealtimeUsage, VoiceTaskStatus } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'
import type { VoiceScope } from './voice.schema'

@Entity('realtime_voice_session')
@Index(['tenantId', 'organizationId', 'userId', 'threadId'])
export class RealtimeVoiceSession extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) userId: string
    @Column({ type: 'uuid' }) threadId: string
    @Column({ type: 'uuid' }) assistantId: string
    @Column({ type: 'jsonb' }) scope: VoiceScope
    @Column({ type: 'varchar' }) configurationHash: string
    @Column({ type: 'varchar' }) originMode: 'web' | 'desktop'
    @Column({ type: 'varchar', default: 'connecting' }) status: 'connecting' | 'active' | 'ended'
    @Column({ type: 'timestamptz' }) expiresAt: Date
    @Column({ type: 'timestamptz', nullable: true }) startedAt?: Date | null
    @Column({ type: 'timestamptz', nullable: true }) endedAt?: Date | null
    @Column({ type: 'jsonb', default: {} }) usageReceipts: Record<string, RealtimeUsage>
    @Column({ type: 'jsonb', nullable: true }) modelSnapshot?: {
        model: string
        copilotId: string
        provider: string
        pricing: { text: ModelUsagePricingSnapshot; audio: ModelUsagePricingSnapshot }
    }
    @Column({ type: 'varchar', default: 'pending' }) usageState: 'pending' | 'reported' | 'incomplete'
}

@Entity('realtime_voice_task')
@Index(['sessionId', 'callId'], { unique: true })
@Index(['status', 'createdAt'])
export class RealtimeVoiceTask extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) sessionId: string
    @Column({ type: 'varchar', length: 256 }) callId: string
    @Column({ type: 'jsonb' }) scope: VoiceScope
    @Column({ type: 'varchar', default: 'queued' }) status: VoiceTaskStatus
    @Column({ type: 'text' }) instruction: string
    @Column({ type: 'varchar', default: 'send' }) action: 'send' | 'steer'
    @Column({ type: 'uuid', nullable: true }) targetExecutionId?: string
    @Column({ type: 'uuid', nullable: true }) executionId?: string
    @Column({ type: 'text', nullable: true }) result?: string | null
    @Column({ type: 'integer', default: 0 }) callbackSequence: number
    @Column({ type: 'boolean', default: false }) cancelRequested: boolean
}

@Entity('realtime_voice_turn')
@Index(['sessionId', 'turnId', 'role'], { unique: true })
export class RealtimeVoiceTurn extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) sessionId: string
    @Column({ type: 'varchar', length: 256 }) turnId: string
    @Column({ type: 'varchar' }) role: 'user' | 'assistant'
    @Column({ type: 'text' }) text: string
    @Column({ type: 'boolean', default: false }) interrupted: boolean
}
