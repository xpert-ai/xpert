import type { IMcpTask, JSONValue, McpApiKeySubjectType, McpTaskStatus } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { McpPublication } from './mcp-publication.entity'

@Entity('mcp_task')
@Index('IDX_mcp_task_task_id', ['taskId'], { unique: true })
@Index('IDX_mcp_task_idempotency', ['publicationId', 'idempotencyKey'], { unique: true })
@Index('IDX_mcp_task_publication_status', ['tenantId', 'publicationId', 'status', 'expiresAt'])
@Index('IDX_mcp_task_subject', ['tenantId', 'publicationId', 'subjectType', 'subjectId', 'updatedAt'])
export class McpTask extends TenantOrganizationBaseEntity implements IMcpTask {
    @ManyToOne(() => McpPublication, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'publicationId' })
    publication?: McpPublication

    @Column({ type: 'uuid' })
    taskId: string

    @Column({ type: 'uuid' })
    publicationId: string

    @Column({ type: 'uuid' })
    capabilityId: string

    @Column({ type: 'uuid' })
    executionId: string

    @Column({ type: 'varchar', length: 191 })
    requestId: string

    @Column({ type: 'varchar', length: 191 })
    toolName: string

    @Column({ type: 'varchar', length: 191 })
    idempotencyKey: string

    @Column({ type: 'char', length: 64 })
    inputHash: string

    @Column({ type: 'varchar', length: 24 })
    subjectType: McpApiKeySubjectType

    @Column({ type: 'uuid' })
    subjectId: string

    @Column({ type: 'varchar', length: 191, nullable: true })
    queueJobId?: string | null

    @Column({ type: 'varchar', length: 24 })
    status: McpTaskStatus

    @Column({ type: 'varchar', length: 500, nullable: true })
    statusMessage?: string | null

    @Column({ type: 'numeric', precision: 5, scale: 4, nullable: true })
    progress?: number | null

    @Column({ type: 'int', nullable: true })
    pollIntervalMs?: number | null

    @Column({ type: 'json', nullable: true, select: false })
    inputRequests?: JSONValue | null

    @Column({ type: 'json', nullable: true, select: false })
    inputResponses?: JSONValue | null

    @Column({ type: 'json', nullable: true, select: false })
    requestPayload?: JSONValue | null

    @Column({ type: 'json', nullable: true, select: false })
    resultRef?: JSONValue | null

    @Column({ type: 'json', nullable: true, select: false })
    error?: { code?: string; message: string } | null

    @Column({ type: 'int', default: 0 })
    revision: number

    @Column({ type: 'timestamptz' })
    expiresAt: Date
}
