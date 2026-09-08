import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { KnowledgeGraphEntity } from './knowledge-graph-entity.entity'

@Entity('knowledge_graph_entity_contribution')
@Index(['entityId', 'sourceDocumentIdSnapshot'], { unique: true })
@Index(['knowledgebaseId', 'sourceDocumentIdSnapshot'])
export class KnowledgeGraphEntityContribution extends TenantOrganizationBaseEntity {
    @ManyToOne(() => KnowledgeGraphEntity, { nullable: false, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    entity: KnowledgeGraphEntity

    @RelationId((contribution: KnowledgeGraphEntityContribution) => contribution.entity)
    @Column({ type: 'uuid' })
    entityId: string

    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @Column({ type: 'uuid' })
    sourceDocumentIdSnapshot: string

    @Column({ type: 'varchar', length: 128 })
    sourceContentHash: string

    @Column({ type: 'int', default: 0 })
    sourcePublicationEpoch: number

    @Column({ type: 'varchar', length: 512 })
    name: string

    @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
    aliases: string[]

    @Column({ type: 'text', nullable: true })
    description?: string | null

    @Column({ type: 'float', nullable: true })
    confidence?: number | null

    @Column({ type: 'int', default: 0 })
    revision: number
}
