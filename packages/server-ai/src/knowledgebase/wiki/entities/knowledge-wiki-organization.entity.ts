// Invariants: directory placement has its own revision and never increments a Wiki article version.
// Folder and placement writes lock the knowledgebase before checking revisions.
import type { KnowledgeWikiPlacement as PlacementContract } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { Knowledgebase } from '../../knowledgebase.entity'
import { KnowledgeWikiPage } from './knowledge-wiki-page.entity'

@Entity('knowledge_wiki_taxonomy')
@Index(['knowledgebaseId'], { unique: true })
export class KnowledgeWikiTaxonomy extends TenantOrganizationBaseEntity {
    @ManyToOne(() => Knowledgebase, { onDelete: 'CASCADE', nullable: false })
    @JoinColumn({ name: 'knowledgebaseId' })
    knowledgebase: Knowledgebase
    @Column({ type: 'uuid' }) knowledgebaseId: string
    @Column({ type: 'boolean', default: false }) enabled: boolean
    @Column({ type: 'int', default: 0 }) revision: number
}

@Entity('knowledge_wiki_folder')
@Index(['knowledgebaseId', 'parentId'])
export class KnowledgeWikiFolder extends TenantOrganizationBaseEntity {
    @ManyToOne(() => Knowledgebase, { onDelete: 'CASCADE', nullable: false })
    @JoinColumn({ name: 'knowledgebaseId' })
    knowledgebase: Knowledgebase
    @Column({ type: 'uuid' }) knowledgebaseId: string
    @ManyToOne(() => KnowledgeWikiFolder, { onDelete: 'RESTRICT', nullable: true })
    @JoinColumn({ name: 'parentId' })
    parent?: KnowledgeWikiFolder | null
    @Column({ type: 'uuid', nullable: true }) parentId: string | null
    @Column({ type: 'varchar', length: 120 }) name: string
    @Column({ type: 'text', default: '' }) description: string
    @Column({ type: 'int', default: 0 }) position: number
    @Column({ type: 'int', default: 1 }) version: number
}

@Entity('knowledge_wiki_placement')
@Index(['pageId'], { unique: true })
@Index(['knowledgebaseId', 'folderId'])
export class KnowledgeWikiPlacement extends TenantOrganizationBaseEntity {
    @ManyToOne(() => Knowledgebase, { onDelete: 'CASCADE', nullable: false })
    @JoinColumn({ name: 'knowledgebaseId' })
    knowledgebase: Knowledgebase
    @Column({ type: 'uuid' }) knowledgebaseId: string
    @ManyToOne(() => KnowledgeWikiPage, { onDelete: 'CASCADE', nullable: false })
    @JoinColumn({ name: 'pageId' })
    page: KnowledgeWikiPage
    @Column({ type: 'uuid' }) pageId: string
    @ManyToOne(() => KnowledgeWikiFolder, { onDelete: 'RESTRICT', nullable: true })
    @JoinColumn({ name: 'folderId' })
    folder?: KnowledgeWikiFolder | null
    @Column({ type: 'uuid', nullable: true }) folderId: string | null
    @Column({ type: 'varchar', length: 24 }) source: PlacementContract['source']
    @Column({ type: 'int', default: 1 }) version: number
}
