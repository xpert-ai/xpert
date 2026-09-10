import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { KnowledgeGraphRelation } from './knowledge-graph-relation.entity'

@Entity('knowledge_graph_relation_contribution')
@Index(['relationId', 'sourceDocumentIdSnapshot'], { unique: true })
@Index(['knowledgebaseId', 'sourceDocumentIdSnapshot'])
export class KnowledgeGraphRelationContribution extends TenantOrganizationBaseEntity {
    @ManyToOne(() => KnowledgeGraphRelation, { nullable: false, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    relation: KnowledgeGraphRelation

    @RelationId((contribution: KnowledgeGraphRelationContribution) => contribution.relation)
    @Column({ type: 'uuid' })
    relationId: string

    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @Column({ type: 'uuid' })
    sourceDocumentIdSnapshot: string

    @Column({ type: 'varchar', length: 128 })
    sourceContentHash: string

    @Column({ type: 'int', default: 0 })
    sourcePublicationEpoch: number

    @Column({ type: 'text', nullable: true })
    description?: string | null

    @Column({ type: 'float', nullable: true })
    confidence?: number | null

    @Column({ type: 'float', nullable: true })
    weight?: number | null

    @Column({ type: 'int', default: 0 })
    revision: number
}
