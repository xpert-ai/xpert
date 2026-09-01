import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import type { ConnectorAuthorizationMode, ConnectorScopeType } from '@xpert-ai/plugin-sdk'
import { Check, Column, Entity, Index } from 'typeorm'

@Entity('xpert_connector_oauth_session')
@Check(
    'CHK_xpert_connector_oauth_session_scope',
    `("scopeType" = 'workspace' AND "workspaceId" IS NOT NULL AND "projectId" IS NULL) OR ("scopeType" = 'project' AND "projectId" IS NOT NULL AND "workspaceId" IS NULL)`
)
@Check('CHK_xpert_connector_oauth_session_authorization_mode', `"authorizationMode" IN ('personal', 'shared')`)
export class ConnectorOAuthSession extends TenantOrganizationBaseEntity {
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 128, update: false })
    stateHash: string

    @Column({ type: 'varchar', default: 'workspace', update: false })
    scopeType: ConnectorScopeType

    @Column({ type: 'uuid', nullable: true, update: false })
    workspaceId?: string | null

    @Column({ type: 'uuid', nullable: true, update: false })
    projectId?: string | null

    @Column({ type: 'varchar', default: 'shared', update: false })
    authorizationMode: ConnectorAuthorizationMode

    @Column({ type: 'uuid', update: false })
    connectorId: string

    @Column({ type: 'uuid', nullable: true, update: false })
    personalAccountId?: string | null

    @Column({ type: 'uuid', nullable: true, update: false })
    actorUserId?: string | null

    @Column({ type: 'uuid', nullable: true, update: false })
    xpertId?: string | null

    @Column({ type: 'uuid', nullable: true, update: false })
    connectionAttemptId?: string | null

    @Column({ type: 'varchar', update: false })
    provider: string

    @Column({ type: 'uuid', nullable: true, update: false })
    appIntegrationId?: string | null

    @Column({ type: 'text', update: false })
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
