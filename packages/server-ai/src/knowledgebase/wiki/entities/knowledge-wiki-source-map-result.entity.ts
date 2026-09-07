import { KnowledgeWikiMappedPageType, KnowledgeWikiPageContributionPayload } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

@Entity('knowledge_wiki_source_map_result')
@Index(['sourceJobId', 'normalizedPageKey'], { unique: true })
@Index(['knowledgebaseId', 'generationRevision'])
@Index(['knowledgebaseId', 'sourceDocumentIdSnapshot'])
export class KnowledgeWikiSourceMapResult extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @Column({ type: 'uuid' })
    sourceJobId: string

    @Column({ type: 'int' })
    generationRevision: number

    @Column({ type: 'int' })
    sourceLifecycleGeneration: number

    @Column({ type: 'uuid' })
    sourceDocumentIdSnapshot: string

    @Column({ type: 'varchar', length: 128 })
    sourceContentHash: string

    @Column({ type: 'varchar', length: 32 })
    pageType: KnowledgeWikiMappedPageType

    @Column({ type: 'varchar', length: 512 })
    canonicalName: string

    @Column({ type: 'varchar', length: 768 })
    normalizedPageKey: string

    @Column({ type: 'jsonb' })
    payload: KnowledgeWikiPageContributionPayload
}
