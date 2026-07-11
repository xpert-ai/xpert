import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import type { ArtifactAccessEvent, ArtifactAccessMode, IArtifactAccessLog } from '@xpert-ai/contracts'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { ArtifactLink } from './artifact-link.entity'

/**
 * Audit trail for Artifact public/scoped access and lifecycle events.
 *
 * It records summaries such as status, hashed IP, and user agent; it must never
 * persist preview tokens, platform credentials, or Artifact file contents.
 */
@Entity('artifact_access_log')
@Index(['tenantId', 'organizationId', 'linkId'])
@Index(['slug'])
export class ArtifactAccessLog extends TenantOrganizationBaseEntity implements IArtifactAccessLog {
    @ManyToOne(() => ArtifactLink, {
        nullable: true,
        onDelete: 'SET NULL'
    })
    @JoinColumn({ name: 'linkId' })
    link?: ArtifactLink | null

    @Column({ type: 'uuid', nullable: true })
    linkId?: string | null

    @Column({ type: 'uuid', nullable: true })
    artifactId?: string | null

    @Column({ type: 'varchar' })
    slug: string

    @Column({ type: 'varchar' })
    event: ArtifactAccessEvent

    @Column({ type: 'varchar', nullable: true })
    accessMode?: ArtifactAccessMode | null

    @Column({ type: 'varchar', nullable: true })
    principalUserId?: string | null

    @Column({ type: 'varchar', nullable: true })
    ipHash?: string | null

    @Column({ type: 'text', nullable: true })
    userAgent?: string | null

    @Column({ type: 'int', nullable: true })
    statusCode?: number | null

    @Column({ type: 'text', nullable: true })
    error?: string | null

    @Column({ type: 'json', nullable: true })
    metadata?: Record<string, unknown> | null
}
