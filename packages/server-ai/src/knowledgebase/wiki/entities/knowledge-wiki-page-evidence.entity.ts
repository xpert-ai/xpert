import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Knowledgebase } from '../../knowledgebase.entity'
import { KnowledgeWikiPage } from './knowledge-wiki-page.entity'
import { KnowledgeWikiPageVersion } from './knowledge-wiki-page-version.entity'

@Entity('knowledge_wiki_page_evidence')
@Index(['knowledgebaseId', 'sourceDocumentIdSnapshot'])
@Index(['pageVersionId', 'ordinal'])
export class KnowledgeWikiPageEvidenceEntity extends TenantOrganizationBaseEntity {
    @ManyToOne(() => Knowledgebase, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    knowledgebase: Knowledgebase

    @RelationId((evidence: KnowledgeWikiPageEvidenceEntity) => evidence.knowledgebase)
    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @ManyToOne(() => KnowledgeWikiPage, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    page: KnowledgeWikiPage

    @RelationId((evidence: KnowledgeWikiPageEvidenceEntity) => evidence.page)
    @Column({ type: 'uuid' })
    pageId: string

    @ManyToOne(() => KnowledgeWikiPageVersion, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    pageVersion: KnowledgeWikiPageVersion

    @RelationId((evidence: KnowledgeWikiPageEvidenceEntity) => evidence.pageVersion)
    @Column({ type: 'uuid' })
    pageVersionId: string

    @Column({ type: 'uuid' })
    sourceDocumentIdSnapshot: string

    @Column({ type: 'uuid' })
    sourceChunkIdSnapshot: string

    @Column({ type: 'text' })
    quote: string

    @Column({ type: 'int' })
    ordinal: number

    @Column({ type: 'varchar', length: 512, nullable: true })
    sectionAnchor?: string | null

    @Column({ type: 'varchar', length: 128 })
    sourceContentHash: string
}
