import type {
    IMcpPublication,
    McpAuthMethod,
    McpPublicationReviewStatus,
    McpPublicationStatus
} from '@xpert-ai/contracts'
import { MCP_PROTOCOL_VERSION } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, OneToMany } from 'typeorm'
import { McpPublicationCapability } from './mcp-publication-capability.entity'

@Entity('mcp_publication')
@Index('IDX_mcp_publication_slug', ['slug'], { unique: true })
@Index('IDX_mcp_publication_scope_status', ['tenantId', 'organizationId', 'status'])
export class McpPublication extends TenantOrganizationBaseEntity implements IMcpPublication {
    @Column({ type: 'varchar', length: 191 })
    name: string

    @Column({ type: 'varchar', length: 191 })
    slug: string

    @Column({ type: 'varchar', length: 20, default: 'draft' })
    status: McpPublicationStatus

    @Column({ type: 'json', default: [] })
    authMethods: McpAuthMethod[]

    @Column({ type: 'text', nullable: true })
    instructions?: string | null

    @Column({ type: 'varchar', length: 20, default: MCP_PROTOCOL_VERSION })
    protocolVersion: typeof MCP_PROTOCOL_VERSION

    @Column({ type: 'varchar', length: 20, default: 'current' })
    reviewStatus: McpPublicationReviewStatus

    @Column({ type: 'text', nullable: true })
    reviewReason?: string | null

    @Column({ type: 'timestamptz', nullable: true })
    reviewedAt?: Date | null

    @Column({ type: 'uuid', nullable: true })
    reviewedById?: string | null

    @OneToMany(() => McpPublicationCapability, (capability) => capability.publication)
    capabilities?: McpPublicationCapability[]
}
