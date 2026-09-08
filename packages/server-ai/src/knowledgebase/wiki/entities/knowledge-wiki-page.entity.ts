import {
    KnowledgeWikiPageStatus,
    KnowledgeWikiPageType,
    KnowledgeWikiProjectionStatus,
    KnowledgeWikiIdentityProfile
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId, VersionColumn } from 'typeorm'
import { Knowledgebase } from '../../knowledgebase.entity'

@Entity('knowledge_wiki_page')
@Index(['knowledgebaseId', 'pageKey'], { unique: true })
@Index(['knowledgebaseId', 'slug'], { unique: true })
@Index(['tenantId', 'organizationId', 'knowledgebaseId', 'status'])
@Index(['knowledgebaseId', 'pageType', 'updatedAt'])
export class KnowledgeWikiPage extends TenantOrganizationBaseEntity {
    @ManyToOne(() => Knowledgebase, {
        nullable: false,
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    knowledgebase: Knowledgebase

    @RelationId((page: KnowledgeWikiPage) => page.knowledgebase)
    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @Column({ type: 'varchar', length: 768 })
    pageKey: string

    @Column({ type: 'varchar', length: 32 })
    pageType: KnowledgeWikiPageType

    @Column({ type: 'varchar', length: 512 })
    canonicalName: string

    @Column({ type: 'varchar', length: 512 })
    normalizedCanonicalName: string

    /** Internal identity catalogue; article text and displayed aliases belong to published versions. */
    @Column({ type: 'jsonb', nullable: true })
    identity?: KnowledgeWikiIdentityProfile | null

    @Column({ type: 'int', default: 0 })
    identityRevision: number

    @Column({ type: 'varchar', length: 600 })
    slug: string

    @Column({ type: 'varchar', length: 32, default: 'building' })
    status: KnowledgeWikiPageStatus

    @Column({ type: 'varchar', length: 32, default: 'pending' })
    projectionStatus: KnowledgeWikiProjectionStatus

    @Column({ type: 'uuid', nullable: true })
    activeVersionId?: string | null

    @Column({ type: 'int', default: 0 })
    sourceCount: number

    @Column({ type: 'int', default: 0 })
    inboundLinkCount: number

    @Column({ type: 'int', default: 0 })
    outboundLinkCount: number

    @Column({ type: 'timestamptz', nullable: true })
    publishedAt?: Date | null

    @VersionColumn({ type: 'int', default: 1 })
    version: number
}
