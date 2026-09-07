import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Knowledgebase } from '../../knowledgebase.entity'

type KnowledgeWikiSourceEventType =
    | 'finish'
    | 'content_changed'
    | 'enabled'
    | 'disabled'
    | 'soft_deleted'
    | 'hard_deleted'

@Entity('knowledge_wiki_source_state')
@Index(['knowledgebaseId', 'sourceDocumentIdSnapshot'], { unique: true })
@Index(['knowledgebaseId', 'eligible', 'cleanupPending'])
export class KnowledgeWikiSourceState extends TenantOrganizationBaseEntity {
    @ManyToOne(() => Knowledgebase, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    knowledgebase: Knowledgebase

    @RelationId((state: KnowledgeWikiSourceState) => state.knowledgebase)
    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @Column({ type: 'uuid' })
    sourceDocumentIdSnapshot: string

    @Column({ type: 'int', default: 0 })
    lifecycleGeneration: number

    @Column({ type: 'varchar', length: 32, nullable: true })
    lastEventType?: KnowledgeWikiSourceEventType | null

    @Column({ type: 'varchar', length: 128, nullable: true })
    lastContentHash?: string | null

    @Column({ type: 'boolean', default: false })
    eligible: boolean

    @Column({ type: 'boolean', default: false })
    cleanupPending: boolean

    @Column({ type: 'boolean', default: false })
    cleanupFailed: boolean

    @Column({ type: 'boolean', default: false })
    generationPending: boolean

    @Column({ type: 'varchar', length: 120, nullable: true })
    generationPendingReason?: string | null

    @Column({ type: 'uuid', nullable: true })
    desiredRootJobId?: string | null
}
