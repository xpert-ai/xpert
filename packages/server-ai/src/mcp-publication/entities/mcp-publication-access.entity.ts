import type { IMcpPublicationAccess } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { McpPublication } from './mcp-publication.entity'

@Entity('mcp_publication_access')
@Index('IDX_mcp_publication_access_organization', ['publicationId', 'organizationId'], { unique: true })
@Index('IDX_mcp_publication_access_scope', ['tenantId', 'organizationId', 'enabled'])
export class McpPublicationAccess extends TenantOrganizationBaseEntity implements IMcpPublicationAccess {
    @ManyToOne(() => McpPublication, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'publicationId' })
    publication?: McpPublication

    @Column({ type: 'uuid' })
    publicationId: string

    @Column({ type: 'boolean', default: true })
    enabled: boolean

    @Column({ type: 'uuid', nullable: true })
    enabledById?: string | null

    @Column({ type: 'timestamptz', nullable: true })
    disabledAt?: Date | null

    @Column({ type: 'uuid', nullable: true })
    disabledById?: string | null
}
