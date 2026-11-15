import { Column, Entity, Index } from 'typeorm'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'

/** Stable identity and rebuildable projection. Native read access is checked live. */
@Entity('content_resource_entry')
@Index('IDX_content_resource_project_type', ['tenantId', 'organizationId', 'projectId', 'typeId'])
@Index('IDX_content_resource_binding', ['tenantId', 'organizationId', 'projectId', 'providerKey', 'resourceId'], {
    unique: true
})
export class ContentResourceEntry extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) projectId: string
    @Column({ type: 'varchar', length: 200 }) providerKey: string
    @Column({ type: 'varchar', length: 256 }) resourceId: string
    @Column({ type: 'varchar', length: 200, nullable: true }) typeId?: string
    @Column({ type: 'varchar', length: 200, nullable: true }) modelId?: string
    @Column({ type: 'varchar', length: 100, nullable: true }) schemaVersion?: string
    @Column({ type: 'varchar', length: 500, nullable: true }) title?: string
    @Column({ type: 'varchar', length: 256, nullable: true }) sourceRevision?: string
    @Column({ type: 'jsonb', nullable: true }) sourceLocation?: import('@xpert-ai/contracts').ContentSourceLocation
    @Column({ type: 'timestamptz', nullable: true }) sourceUpdatedAt?: Date
    @Column({ type: 'boolean', default: false }) deleted: boolean
    @Column({ type: 'int', default: 1 }) bindingRevision: number
    /** Retained for offline display or write ownership; presence alone never grants offline reading. */
    @Column({ type: 'jsonb', nullable: true }) offlineSnapshot?: import('@xpert-ai/contracts').ContentResourceSnapshot
}
