import { KnowledgeWikiPageContributionPayload } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Knowledgebase } from '../../knowledgebase.entity'
import { KnowledgeWikiPage } from './knowledge-wiki-page.entity'
import { KnowledgeWikiPageVersion } from './knowledge-wiki-page-version.entity'

@Entity('knowledge_wiki_page_contribution')
@Index(['pageVersionId', 'sourceDocumentIdSnapshot'], { unique: true })
@Index(['knowledgebaseId', 'sourceDocumentIdSnapshot'])
export class KnowledgeWikiPageContribution extends TenantOrganizationBaseEntity {
    @ManyToOne(() => Knowledgebase, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    knowledgebase: Knowledgebase

    @RelationId((contribution: KnowledgeWikiPageContribution) => contribution.knowledgebase)
    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @ManyToOne(() => KnowledgeWikiPage, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    page: KnowledgeWikiPage

    @RelationId((contribution: KnowledgeWikiPageContribution) => contribution.page)
    @Column({ type: 'uuid' })
    pageId: string

    @ManyToOne(() => KnowledgeWikiPageVersion, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    pageVersion: KnowledgeWikiPageVersion

    @RelationId((contribution: KnowledgeWikiPageContribution) => contribution.pageVersion)
    @Column({ type: 'uuid' })
    pageVersionId: string

    @Column({ type: 'uuid' })
    sourceDocumentIdSnapshot: string

    @Column({ type: 'int' })
    sourceLifecycleGeneration: number

    @Column({ type: 'varchar', length: 128 })
    sourceContentHash: string

    @Column({ type: 'int' })
    wikiRevision: number

    @Column({ type: 'varchar', length: 120 })
    generatorVersion: string

    @Column({ type: 'jsonb' })
    payload: KnowledgeWikiPageContributionPayload
}
