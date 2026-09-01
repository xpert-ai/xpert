import type {
    ConnectorAuthorizationMode,
    ConnectorProfile,
    ConnectorScopeType,
    ConnectorStatus
} from '@xpert-ai/plugin-sdk'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import type { XpertProject } from '../xpert-project/entities/project.entity'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'

@Entity('xpert_connector')
@Check(
    'CHK_xpert_connector_scope',
    `("scopeType" = 'workspace' AND "workspaceId" IS NOT NULL AND "projectId" IS NULL) OR ("scopeType" = 'project' AND "projectId" IS NOT NULL AND "workspaceId" IS NULL)`
)
@Check('CHK_xpert_connector_authorization_mode', `"authorizationMode" IN ('personal', 'shared')`)
@Index('UQ_xpert_connector_workspace_provider', ['tenantId', 'workspaceId', 'provider'], {
    unique: true,
    where: `"scopeType" = 'workspace' AND "workspaceId" IS NOT NULL`
})
@Index('UQ_xpert_connector_project_provider', ['tenantId', 'projectId', 'provider'], {
    unique: true,
    where: `"scopeType" = 'project' AND "projectId" IS NOT NULL`
})
export class Connector extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar', default: 'workspace', update: false })
    scopeType: ConnectorScopeType

    @Column({ type: 'uuid', nullable: true, update: false })
    workspaceId?: string | null

    @ManyToOne(() => XpertWorkspace, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn()
    workspace?: XpertWorkspace

    @Column({ type: 'uuid', nullable: true, update: false })
    projectId?: string | null

    @ManyToOne('XpertProject', { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn()
    project?: XpertProject

    @Column({ type: 'varchar', update: false })
    provider: string

    @Column({ type: 'varchar', default: 'shared', update: false })
    authorizationMode: ConnectorAuthorizationMode

    @Column({ type: 'varchar', nullable: true })
    authMethodId?: string | null

    @Column({ type: 'uuid', nullable: true })
    connectionAttemptId?: string | null

    @Column({ type: 'varchar' })
    status: ConnectorStatus

    @Column({ type: 'uuid', nullable: true })
    appIntegrationId?: string | null

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
