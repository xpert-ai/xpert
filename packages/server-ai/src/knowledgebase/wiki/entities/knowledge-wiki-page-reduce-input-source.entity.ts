import { KnowledgeWikiPageContributionPayload } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { KnowledgeWikiPageReduceInput } from './knowledge-wiki-page-reduce-input.entity'

export type KnowledgeWikiReduceEvidence = {
    sourceChunkId: string
    quote: string
    ordinal: number
    sectionAnchor?: string | null
}

@Entity('knowledge_wiki_page_reduce_input_source')
@Index(['inputId', 'sourceDocumentIdSnapshot'], { unique: true })
@Index(['knowledgebaseId', 'sourceDocumentIdSnapshot'])
export class KnowledgeWikiPageReduceInputSource extends TenantOrganizationBaseEntity {
    @ManyToOne(() => KnowledgeWikiPageReduceInput, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    input: KnowledgeWikiPageReduceInput

    @RelationId((source: KnowledgeWikiPageReduceInputSource) => source.input)
    @Column({ type: 'uuid' })
    inputId: string

    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @Column({ type: 'uuid' })
    sourceDocumentIdSnapshot: string

    @Column({ type: 'int' })
    sourceLifecycleGeneration: number

    @Column({ type: 'int' })
    sourcePublicationEpoch: number

    @Column({ type: 'varchar', length: 128 })
    sourceContentHash: string

    @Column({ type: 'jsonb' })
    payload: KnowledgeWikiPageContributionPayload

    @Column({ type: 'jsonb' })
    evidence: KnowledgeWikiReduceEvidence[]
}
