import type { ConnectorAuthorizationMode, ConnectorScopeType } from '@xpert-ai/plugin-sdk'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

export type ConnectorRuntimeAuditOutcome = 'resolved' | 'denied'

@Entity('xpert_connector_runtime_audit')
@Index('IDX_xpert_connector_runtime_audit_binding_created', ['tenantId', 'connectorId', 'createdAt'])
@Index('IDX_xpert_connector_runtime_audit_execution', ['tenantId', 'executionId'])
export class ConnectorRuntimeAudit extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' })
    connectorId: string

    @Column({ type: 'uuid', nullable: true })
    accountId?: string | null

    @Column({ type: 'varchar' })
    provider: string

    @Column({ type: 'varchar' })
    scopeType: ConnectorScopeType

    @Column({ type: 'varchar' })
    authorizationMode: ConnectorAuthorizationMode

    @Column({ type: 'uuid', nullable: true })
    workspaceId?: string | null

    @Column({ type: 'uuid', nullable: true })
    projectId?: string | null

    @Column({ type: 'uuid', nullable: true })
    actorUserId?: string | null

    @Column({ type: 'uuid', nullable: true })
    xpertId?: string | null

    @Column({ type: 'uuid', nullable: true })
    conversationId?: string | null

    @Column({ type: 'uuid', nullable: true })
    executionId?: string | null

    @Column({ type: 'varchar' })
    outcome: ConnectorRuntimeAuditOutcome

    @Column({ type: 'varchar', nullable: true })
    errorCode?: string | null
}
