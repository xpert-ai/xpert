import type {
    IMcpPublicationCapability,
    McpCapabilityDescriptor,
    McpCapabilityPolicy,
    McpCapabilityType
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { McpPublication } from './mcp-publication.entity'

@Entity('mcp_publication_capability')
@Index('IDX_mcp_publication_capability_public_name', ['publicationId', 'publicName'], { unique: true })
@Index('IDX_mcp_publication_capability_binding', ['publicationId', 'toolsetId', 'capabilityType', 'capabilityKey'], {
    unique: true
})
@Index('IDX_mcp_publication_capability_scope', ['tenantId', 'organizationId', 'enabled'])
export class McpPublicationCapability extends TenantOrganizationBaseEntity implements IMcpPublicationCapability {
    @ManyToOne(() => McpPublication, (publication) => publication.capabilities, {
        nullable: false,
        onDelete: 'CASCADE'
    })
    @JoinColumn({ name: 'publicationId' })
    publication?: McpPublication

    @Column({ type: 'uuid' })
    publicationId: string

    /** The concrete toolset identity is retained even if that toolset is later deleted. */
    @Column({ type: 'uuid' })
    toolsetId: string

    @Column({ type: 'varchar', length: 40 })
    capabilityType: McpCapabilityType

    @Column({ type: 'varchar', length: 191 })
    capabilityKey: string

    @Column({ type: 'varchar', length: 191 })
    publicName: string

    @Column({ type: 'boolean', default: true })
    enabled: boolean

    @Column({ type: 'json', nullable: true })
    policy?: McpCapabilityPolicy | null

    @Column({ type: 'char', length: 64 })
    descriptorHash: string

    /** Required to classify descriptor changes instead of treating every hash change as breaking. */
    @Column({ type: 'json' })
    descriptorSnapshot: McpCapabilityDescriptor

    @Column({ type: 'varchar', length: 64, nullable: true })
    pluginVersion?: string | null
}
