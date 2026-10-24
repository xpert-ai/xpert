import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import type { IAnalyticsDefinition, IAnalyticsDefinitionVersion, JSONValue } from '@xpert-ai/contracts'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'

@Entity('analytics_definition')
@Index('IDX_analytics_definition_owner', ['tenantId', 'organizationId', 'userId'])
export class AnalyticsDefinition extends TenantOrganizationBaseEntity implements IAnalyticsDefinition {
    declare id: string
    declare tenantId: string
    declare organizationId: string
    @Column({ type: 'uuid' }) userId: string
    @Column({ type: 'varchar' }) name: string
    @Column({ type: 'varchar' }) providerId: string
    @Column({ type: 'varchar', default: 'private' }) visibility: 'private' | 'organization'
    @Column({ type: 'varchar', default: 'active' }) status: 'active' | 'archived'
    @Column({ type: 'uuid', nullable: true }) currentVersionId: string | null
}
@Entity('analytics_definition_version')
@Index('IDX_analytics_definition_version_number', ['definitionId', 'versionNumber'], { unique: true })
export class AnalyticsDefinitionVersion extends TenantOrganizationBaseEntity implements IAnalyticsDefinitionVersion {
    declare id: string
    @Column({ type: 'uuid' }) definitionId: string
    @ManyToOne(() => AnalyticsDefinition, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'definitionId' })
    definition?: AnalyticsDefinition
    @Column({ type: 'int' }) versionNumber: number
    @Column({ type: 'json' }) options: Record<string, JSONValue>
    @Column({ type: 'varchar' }) sha256: string
}
