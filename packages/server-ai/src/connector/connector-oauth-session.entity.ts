import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

@Entity('xpert_connector_oauth_session')
export class ConnectorOAuthSession extends TenantOrganizationBaseEntity {
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 128 })
    stateHash: string

    @Column({ type: 'uuid' })
    workspaceId: string

    @Column({ type: 'uuid' })
    connectorId: string

    @Column({ type: 'varchar' })
    provider: string

    @Column({ type: 'uuid', nullable: true })
    appIntegrationId?: string | null

    @Column({ type: 'text' })
    redirectUri: string

    @Column({ type: 'text', nullable: true })
    authorizationUrl?: string | null

    @Column({ type: 'integer', nullable: true })
    pollIntervalSeconds?: number | null

    @Column({ type: 'text', nullable: true })
    metadataCiphertext?: string | null

    @Column({ type: 'jsonb', nullable: true })
    scopes?: string[] | null

    @Column({ type: 'timestamptz' })
    expiresAt: Date

    @Column({ type: 'timestamptz', nullable: true })
    consumedAt?: Date | null
}
