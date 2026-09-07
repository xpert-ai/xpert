import { KnowledgeWikiPageStatus, KnowledgeWikiProjectionStatus } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Knowledgebase } from '../../knowledgebase.entity'
import { KnowledgeWikiPage } from './knowledge-wiki-page.entity'

@Entity('knowledge_wiki_page_version')
@Index(['pageId', 'producerJobId', 'generationAttempt'], { unique: true })
@Index(['knowledgebaseId', 'generationRevision', 'status'])
export class KnowledgeWikiPageVersion extends TenantOrganizationBaseEntity {
    @ManyToOne(() => Knowledgebase, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    knowledgebase: Knowledgebase

    @RelationId((version: KnowledgeWikiPageVersion) => version.knowledgebase)
    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @ManyToOne(() => KnowledgeWikiPage, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    page: KnowledgeWikiPage

    @RelationId((version: KnowledgeWikiPageVersion) => version.page)
    @Column({ type: 'uuid' })
    pageId: string

    @Column({ type: 'uuid' })
    producerJobId: string

    @Column({ type: 'int' })
    generationAttempt: number

    @Column({ type: 'int' })
    generationRevision: number

    @Column({ type: 'varchar', length: 120 })
    generatorVersion: string

    @Column({ type: 'varchar', length: 128 })
    configFingerprint: string

    @Column({ type: 'int' })
    expectedPageVersion: number

    @Column({ type: 'varchar', length: 512 })
    title: string

    @Column({ type: 'text' })
    summary: string

    @Column({ type: 'text' })
    contentMarkdown: string

    @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
    aliases: string[]

    @Column({ type: 'varchar', length: 128 })
    contentHash: string

    @Column({ type: 'varchar', length: 32, default: 'building' })
    status: KnowledgeWikiPageStatus

    @Column({ type: 'varchar', length: 32, default: 'pending' })
    projectionStatus: KnowledgeWikiProjectionStatus

    @Column({ type: 'int', nullable: true })
    projectionEmbeddingRevision?: number | null

    @Column({ type: 'varchar', length: 128, nullable: true })
    projectionEmbeddingFingerprint?: string | null

    @Column({ type: 'text', nullable: true })
    projectionError?: string | null

    @Column({ type: 'timestamptz', nullable: true })
    publishedAt?: Date | null
}
