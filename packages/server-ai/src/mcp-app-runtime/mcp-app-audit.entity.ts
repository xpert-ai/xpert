import { JSONValue } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'
import type { McpAppToolRisk } from './mcp-app-tool-approval.service'

export const MCP_APP_AUDIT_OUTCOMES = [
    'started',
    'succeeded',
    'failed',
    'approval_required',
    'approved',
    'rejected'
] as const

export type McpAppAuditOutcome = (typeof MCP_APP_AUDIT_OUTCOMES)[number]

@Entity('mcp_app_audit')
@Index('IDX_mcp_app_audit_instance_created', ['tenantId', 'appInstanceId', 'createdAt'])
@Index('IDX_mcp_app_audit_workspace_created', ['tenantId', 'workspaceId', 'createdAt'])
export class McpAppAudit extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid', nullable: true })
    workspaceId?: string | null

    @Column({ type: 'uuid' })
    toolsetId: string

    @Column({ type: 'uuid' })
    appInstanceId: string

    @Column({ type: 'uuid', nullable: true })
    userId?: string | null

    @Column({ type: 'varchar', length: 191 })
    method: string

    @Column({ type: 'varchar', length: 191, nullable: true })
    toolName?: string | null

    @Column({ type: 'varchar', length: 20, nullable: true })
    risk?: McpAppToolRisk | null

    @Column({ type: 'varchar', length: 24 })
    outcome: McpAppAuditOutcome

    @Column({ type: 'varchar', length: 64, nullable: true })
    approvalId?: string | null

    @Column({ type: 'int', nullable: true })
    durationMs?: number | null

    @Column({ type: 'varchar', length: 100, nullable: true })
    errorCode?: string | null

    @Column({ type: 'json', nullable: true, select: false })
    requestSummary?: JSONValue | null
}
