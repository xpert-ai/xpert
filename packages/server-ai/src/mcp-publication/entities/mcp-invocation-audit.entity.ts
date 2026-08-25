import type {
    IMcpInvocationAudit,
    JSONValue,
    McpApiKeySubjectType,
    McpAuthMethod,
    McpInvocationStatus
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { McpPublication } from './mcp-publication.entity'

@Entity('mcp_invocation_audit')
@Index('IDX_mcp_invocation_audit_request', ['requestId'], { unique: true })
@Index('IDX_mcp_invocation_audit_publication_created', ['tenantId', 'publicationId', 'createdAt'])
@Index('IDX_mcp_invocation_audit_subject_created', ['tenantId', 'subjectId', 'createdAt'])
export class McpInvocationAudit extends TenantOrganizationBaseEntity implements IMcpInvocationAudit {
    @ManyToOne(() => McpPublication, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'publicationId' })
    publication?: McpPublication

    @Column({ type: 'uuid' })
    publicationId: string

    @Column({ type: 'uuid', nullable: true })
    capabilityId?: string | null

    @Column({ type: 'uuid', nullable: true })
    toolsetId?: string | null

    @Column({ type: 'varchar', length: 191, nullable: true })
    capabilityKey?: string | null

    @Column({ type: 'varchar', length: 191, nullable: true })
    publicName?: string | null

    @Column({ type: 'varchar', length: 20 })
    authMethod: McpAuthMethod

    @Column({ type: 'varchar', length: 24 })
    subjectType: McpApiKeySubjectType

    @Column({ type: 'uuid' })
    subjectId: string

    @Column({ type: 'varchar', length: 191, nullable: true })
    clientName?: string | null

    @Column({ type: 'uuid' })
    requestId: string

    @Column({ type: 'varchar', length: 64, nullable: true })
    traceId?: string | null

    @Column({ type: 'varchar', length: 20 })
    status: McpInvocationStatus

    @Column({ type: 'int', nullable: true })
    durationMs?: number | null

    @Column({ type: 'varchar', length: 100, nullable: true })
    errorCode?: string | null

    @Column({ type: 'json', nullable: true, select: false })
    argumentSummary?: JSONValue | null
}
