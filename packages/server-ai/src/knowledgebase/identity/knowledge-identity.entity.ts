import { KnowledgeIdentityDescriptor, KnowledgeIdentityEmbedding } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'

@Entity('knowledge_identity')
@Index(['knowledgebaseId', 'kind'])
export class KnowledgeIdentity extends TenantOrganizationBaseEntity {
    @ManyToOne(() => Knowledgebase, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'knowledgebaseId' })
    knowledgebase: Knowledgebase

    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @Column({ type: 'varchar', length: 32 })
    kind: KnowledgeIdentityDescriptor['kind']

    // This cache is disposable; current source observations are the identity evidence authority.
    @Column({ type: 'jsonb', nullable: true })
    embedding: KnowledgeIdentityEmbedding | null

    @Column({ type: 'int', default: 1 })
    revision: number
}
