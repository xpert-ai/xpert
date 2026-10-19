import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import type { IArtifactDraft } from '@xpert-ai/contracts'
import type { ArtifactVersionInput } from '@xpert-ai/plugin-sdk'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { Artifact } from '../entities/artifact.entity'

@Entity('artifact_draft')
@Index(['artifactId'], { unique: true })
export class ArtifactDraft extends TenantOrganizationBaseEntity implements IArtifactDraft {
    @ManyToOne(() => Artifact, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'artifactId' })
    artifact?: Artifact
    @Column({ type: 'uuid' }) artifactId: string
    @Column({ type: 'int' }) revision: number
    @Column({ type: 'uuid', nullable: true }) baseVersionId: string | null
    @Column({ type: 'int', nullable: true }) publishedRevision: number | null
    @Column({ type: 'uuid', nullable: true }) publishedVersionId: string | null
    @Column({ type: 'json' }) content: ArtifactVersionInput
}
