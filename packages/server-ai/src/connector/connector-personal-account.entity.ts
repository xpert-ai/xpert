import type { ConnectorProfile, ConnectorStatus } from '@xpert-ai/plugin-sdk'
import { TenantBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

@Entity('xpert_connector_personal_account')
@Index('UQ_xpert_connector_personal_account_user_provider', ['tenantId', 'userId', 'provider'], { unique: true })
export class ConnectorPersonalAccount extends TenantBaseEntity {
    @Column({ type: 'uuid', update: false })
    userId: string

    @Column({ type: 'varchar', update: false })
    provider: string

    @Column({ type: 'varchar', nullable: true })
    authMethodId?: string | null

    @Column({ type: 'uuid', nullable: true })
    connectionAttemptId?: string | null

    @Column({ type: 'varchar' })
    status: ConnectorStatus

    @Column({ type: 'jsonb', nullable: true })
    profile?: ConnectorProfile | null

    @Column({ type: 'jsonb', nullable: true })
    scopes?: string[] | null

    @Column({ type: 'text', nullable: true })
    credentialCiphertext?: string | null

    @Column({ type: 'timestamptz', nullable: true })
    expiresAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    refreshExpiresAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    connectedAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    disconnectedAt?: Date | null

    @Column({ type: 'text', nullable: true })
    lastError?: string | null
}
