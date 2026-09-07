import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Knowledgebase } from '../../knowledgebase.entity'
import { KnowledgeWikiPage } from './knowledge-wiki-page.entity'
import { KnowledgeWikiPageVersion } from './knowledge-wiki-page-version.entity'

@Entity('knowledge_wiki_page_link')
@Index(['sourcePageVersionId', 'targetPageId', 'sectionAnchor'], { unique: true })
@Index(['knowledgebaseId', 'targetPageId'])
export class KnowledgeWikiPageLinkEntity extends TenantOrganizationBaseEntity {
    @ManyToOne(() => Knowledgebase, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    knowledgebase: Knowledgebase

    @RelationId((link: KnowledgeWikiPageLinkEntity) => link.knowledgebase)
    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @ManyToOne(() => KnowledgeWikiPage, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    sourcePage: KnowledgeWikiPage

    @RelationId((link: KnowledgeWikiPageLinkEntity) => link.sourcePage)
    @Column({ type: 'uuid' })
    sourcePageId: string

    @ManyToOne(() => KnowledgeWikiPageVersion, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    sourcePageVersion: KnowledgeWikiPageVersion

    @RelationId((link: KnowledgeWikiPageLinkEntity) => link.sourcePageVersion)
    @Column({ type: 'uuid' })
    sourcePageVersionId: string

    @ManyToOne(() => KnowledgeWikiPage, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    targetPage: KnowledgeWikiPage

    @RelationId((link: KnowledgeWikiPageLinkEntity) => link.targetPage)
    @Column({ type: 'uuid' })
    targetPageId: string

    @Column({ type: 'varchar', length: 512, nullable: true })
    sectionAnchor?: string | null

    @Column({ type: 'varchar', length: 512, nullable: true })
    label?: string | null
}
