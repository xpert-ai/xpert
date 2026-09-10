import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { KnowledgeWikiPage } from './knowledge-wiki-page.entity'

export type KnowledgeWikiPageReduceInputStatus = 'prepared' | 'running' | 'succeeded' | 'failed' | 'stale'

@Entity('knowledge_wiki_page_reduce_input')
@Index(['stageJobId', 'generationAttempt'], { unique: true })
@Index(['knowledgebaseId', 'pageId', 'status'])
export class KnowledgeWikiPageReduceInput extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @ManyToOne(() => KnowledgeWikiPage, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    page: KnowledgeWikiPage

    @RelationId((input: KnowledgeWikiPageReduceInput) => input.page)
    @Column({ type: 'uuid' })
    pageId: string

    @Column({ type: 'uuid' })
    rootJobId: string

    @Column({ type: 'uuid' })
    stageJobId: string

    @Column({ type: 'int' })
    generationAttempt: number

    @Column({ type: 'int' })
    generationRevision: number

    @Column({ type: 'varchar', length: 128 })
    configFingerprint: string

    @Column({ type: 'varchar', length: 120 })
    generatorVersion: string

    @Column({ type: 'int' })
    expectedPageVersion: number

    @Column({ type: 'varchar', length: 128 })
    inputFingerprint: string

    @Column({ type: 'varchar', length: 32, default: 'prepared' })
    status: KnowledgeWikiPageReduceInputStatus

    @Column({ type: 'timestamptz', nullable: true })
    completedAt?: Date | null
}
