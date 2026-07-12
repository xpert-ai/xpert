import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import type {
    ArtifactAccessMode,
    ArtifactLinkDisposition,
    ArtifactLinkStatus,
    ArtifactLinkVersionMode,
    ArtifactSafeHtmlProfile,
    IArtifactLink
} from '@xpert-ai/contracts'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { Artifact } from './artifact.entity'

/**
 * Public or scoped entrypoint for opening/downloading an Artifact.
 *
 * The `slug` is the stable, short, non-guessable handle copied into URLs; access
 * policy and version mode live here rather than in the Artifact container.
 */
@Entity('artifact_link')
@Index(['slug'], { unique: true })
@Index(['tenantId', 'organizationId', 'artifactId'])
@Index(['tenantId', 'organizationId', 'status'])
export class ArtifactLink extends TenantOrganizationBaseEntity implements IArtifactLink {
    @ManyToOne(() => Artifact, {
        nullable: false,
        onDelete: 'CASCADE'
    })
    @JoinColumn({ name: 'artifactId' })
    artifact?: Artifact

    @Column({ type: 'uuid' })
    artifactId: string

    @Column({ type: 'uuid', nullable: true })
    artifactVersionId?: string | null

    @Column({ type: 'varchar', default: 'latest' })
    versionMode: ArtifactLinkVersionMode

    @Column({ type: 'varchar' })
    slug: string

    @Column({ type: 'text' })
    publicUrl: string

    @Column({ type: 'varchar' })
    accessMode: ArtifactAccessMode

    @Column({ type: 'varchar', default: 'active' })
    status: ArtifactLinkStatus

    @Column({ type: 'json', nullable: true })
    customPrincipals?: string[] | null

    @Column({ type: 'varchar', nullable: true })
    tokenHash?: string | null

    @Column({ type: 'timestamptz', nullable: true })
    expiresAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    revokedAt?: Date | null

    @Column({ type: 'int', default: 0 })
    accessCount: number

    @Column({ type: 'int', default: 0 })
    downloadCount: number

    @Column({ type: 'varchar', default: 'inline' })
    disposition: ArtifactLinkDisposition

    @Column({ type: 'boolean', default: true })
    allowDownload: boolean

    @Column({ type: 'varchar', nullable: true })
    safeHtmlProfile?: ArtifactSafeHtmlProfile | null

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
