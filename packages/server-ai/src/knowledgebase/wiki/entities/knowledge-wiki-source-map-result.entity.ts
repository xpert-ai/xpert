import {
    KnowledgeWikiMappedPageType,
    KnowledgeWikiPageContributionPayload,
    KnowledgeWikiIdentityDescriptor,
    KnowledgeWikiIdentityDecision,
    KnowledgeWikiIdentityEmbedding
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

@Entity('knowledge_wiki_source_map_result')
@Index(['sourceJobId', 'candidateKey'], { unique: true })
@Index(['knowledgebaseId', 'normalizedPageKey'])
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

    @Column({ type: 'varchar', length: 128, nullable: true })
    candidateKey: string | null

    @Column({ type: 'varchar', length: 768, nullable: true })
    normalizedPageKey: string | null

    @Column({ type: 'jsonb', nullable: true })
    identity: KnowledgeWikiIdentityDescriptor | null

    @Column({ type: 'jsonb', nullable: true })
    identityEmbedding?: KnowledgeWikiIdentityEmbedding | null

    @Column({ type: 'jsonb', nullable: true })
    identityDecision?: KnowledgeWikiIdentityDecision | null

    @Column({ type: 'jsonb' })
    payload: KnowledgeWikiPageContributionPayload
}
