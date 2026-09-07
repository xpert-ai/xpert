import { KnowledgeWikiProjectionStatus } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId, VersionColumn } from 'typeorm'
import { Knowledgebase } from '../../knowledgebase.entity'

@Entity('knowledge_wiki_projection_state')
@Index(['knowledgebaseId'], { unique: true })
@Index(['projectionDocumentId'], { unique: true })
export class KnowledgeWikiProjectionState extends TenantOrganizationBaseEntity {
    @ManyToOne(() => Knowledgebase, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    knowledgebase: Knowledgebase

    @RelationId((state: KnowledgeWikiProjectionState) => state.knowledgebase)
    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @Column({ type: 'uuid', nullable: true })
    projectionDocumentId?: string | null

    @Column({ type: 'int', default: 0 })
    projectionEpoch: number

    @Column({ type: 'varchar', length: 32, default: 'disabled' })
    status: KnowledgeWikiProjectionStatus

    @Column({ type: 'text', nullable: true })
    error?: string | null

    @VersionColumn({ type: 'int', default: 1 })
    version: number
}
