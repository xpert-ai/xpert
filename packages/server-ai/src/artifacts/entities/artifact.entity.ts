import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import type { ArtifactKind, ArtifactStatus, IArtifact } from '@xpert-ai/contracts'
import { Column, Entity, Index } from 'typeorm'

/**
 * Durable Artifact container owned by a plugin/Agent resource.
 *
 * Bytes are stored on ArtifactVersion rows; this entity keeps source identity,
 * tenant scope, current-version pointer, and user-facing metadata.
 */
@Entity('artifact')
@Index(['tenantId', 'organizationId', 'pluginName', 'resourceType', 'resourceId'])
export class Artifact extends TenantOrganizationBaseEntity implements IArtifact {
    @Column({ type: 'varchar' })
    pluginName: string

    @Column({ type: 'varchar' })
    resourceType: string

    @Column({ type: 'varchar' })
    resourceId: string

    @Column({ type: 'varchar', nullable: true })
    checksum?: string | null

    @Column({ type: 'varchar', default: 'file' })
    kind: ArtifactKind

    @Column({ type: 'varchar', default: 'active' })
    status: ArtifactStatus

    @Column({ type: 'varchar', nullable: true })
    title?: string | null

    @Column({ type: 'text', nullable: true })
    description?: string | null

    @Column({ type: 'uuid', nullable: true })
    currentVersionId?: string | null

    @Column({ type: 'varchar', nullable: true })
    workspaceId?: string | null

    @Column({ type: 'varchar', nullable: true })
    projectId?: string | null

    @Column({ type: 'varchar', nullable: true })
    xpertId?: string | null

    @Column({ type: 'varchar', nullable: true })
    userId?: string | null

    @Column({ type: 'json', nullable: true })
    metadata?: Record<string, unknown> | null
}
