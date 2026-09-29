import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'
import type { AgentPluginConnectorBinding, RuntimeResourceDefinition } from '@xpert-ai/contracts'
import type { PortablePlugin } from './agent-plugin-parser'

@Entity('agent_plugin_package')
@Index(['tenantId', 'organizationId', 'digest'])
export class AgentPluginPackage extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar' }) rootPath: string
    @Column({ type: 'varchar' }) digest: string
    @Column({ type: 'jsonb' }) descriptor: PortablePlugin
    @Column({ type: 'jsonb' }) source: {
        kind: 'git' | 'zip'
        url?: string
        ref?: string
        commit?: string
        subdirectory?: string
    }
}

@Entity('agent_resource_binding')
@Index(['tenantId', 'organizationId', 'enabled'])
export class AgentResourceBinding extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar' }) title: string
    @Column({ type: 'varchar', nullable: true }) description?: string
    @Column({ type: 'varchar' }) version: string
    @Column({ type: 'jsonb' }) workspaceIds: string[]
    @Column({ type: 'jsonb' }) definition: RuntimeResourceDefinition
    @Column({ type: 'jsonb', default: {} }) installations: {
        [workspaceId: string]: {
            skills: string[]
            toolsets: string[]
            connectors?: { [serverName: string]: AgentPluginConnectorBinding }
        }
    }
    @Column({ type: 'jsonb', default: {} }) expertVersions: { [id: string]: string }
    @Column({ type: 'boolean', default: true }) enabled: boolean
    @Column({ type: 'uuid', nullable: true }) supersededById?: string | null
}
