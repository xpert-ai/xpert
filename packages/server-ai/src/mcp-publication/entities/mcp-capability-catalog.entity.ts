import type { IMcpCapabilityCatalog, McpCapabilityDescriptor, McpCapabilityType } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

@Entity('mcp_capability_catalog')
@Index('IDX_mcp_capability_catalog_binding', ['toolsetId', 'capabilityType', 'capabilityKey'], { unique: true })
@Index('IDX_mcp_capability_catalog_scope', ['tenantId', 'organizationId', 'enabled'])
export class McpCapabilityCatalog extends TenantOrganizationBaseEntity implements IMcpCapabilityCatalog {
    /** Concrete toolset instance; intentionally not a FK so broken bindings stay diagnosable. */
    @Column({ type: 'uuid' })
    toolsetId: string

    @Column({ type: 'varchar', length: 40 })
    capabilityType: McpCapabilityType

    @Column({ type: 'varchar', length: 191 })
    capabilityKey: string

    @Column({ type: 'char', length: 64 })
    descriptorHash: string

    @Column({ type: 'json' })
    descriptor: McpCapabilityDescriptor

    @Column({ type: 'boolean', default: true })
    enabled: boolean
}
