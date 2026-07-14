import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import type { ArtifactVersionStatus, IArtifactVersion } from '@xpert-ai/contracts'
import type { WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { Artifact } from './artifact.entity'

/** Converts PostgreSQL bigint strings into JavaScript numbers for file sizes. */
const bigintNumberTransformer = {
    to: (value?: number | null) => value,
    from: (value: string | null) => (value !== null ? Number(value) : null)
}

/**
 * Immutable content snapshot for an Artifact.
 *
 * Each version points to a portable Workspace Files reference and records
 * content metadata used by preview, download, and checksum validation.
 */
@Entity('artifact_version')
@Index(['tenantId', 'organizationId', 'artifactId', 'versionNumber'], { unique: true })
@Index(['tenantId', 'organizationId', 'artifactId', 'sourceVersionId'])
@Index(['artifactId', 'idempotencyKey'], { unique: true })
@Index(['sha256'])
export class ArtifactVersion extends TenantOrganizationBaseEntity implements IArtifactVersion {
    @ManyToOne(() => Artifact, {
        nullable: false,
        onDelete: 'CASCADE'
    })
    @JoinColumn({ name: 'artifactId' })
    artifact?: Artifact

    @Column({ type: 'uuid' })
    artifactId: string

    @Column({ type: 'int' })
    versionNumber: number

    @Column({ type: 'varchar', default: 'active' })
    status: ArtifactVersionStatus

    @Column({ type: 'varchar', nullable: true })
    idempotencyKey?: string | null

    @Column({ type: 'varchar', nullable: true })
    sourceVersionId?: string | null

    @Column({ type: 'varchar', nullable: true })
    checksum?: string | null

    @Column({ type: 'json' })
    workspaceFileRef: WorkspacePortableFileReference

    @Column({ type: 'varchar' })
    mimeType: string

    @Column({ type: 'varchar', nullable: true })
    fileName?: string | null

    @Column({ type: 'varchar', nullable: true })
    title?: string | null

    @Column({ type: 'text', nullable: true })
    description?: string | null

    @Column({ type: 'bigint', nullable: true, transformer: bigintNumberTransformer })
    size?: number | null

    @Column({ type: 'varchar', nullable: true })
    sha256?: string | null

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
