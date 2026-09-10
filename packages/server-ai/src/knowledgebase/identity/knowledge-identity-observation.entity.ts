import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { KnowledgeIdentityDecision, KnowledgeIdentityObservationPayload } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { KnowledgeIdentity } from './knowledge-identity.entity'

// Invariants: observations survive projection rebuilds. Each consumer atomically replaces its
// document extraction; only current observations supply live identity evidence.
@Entity('knowledge_identity_observation')
@Index(['knowledgebaseId', 'sourceDocumentIdSnapshot'])
@Index(['knowledgebaseId', 'sourceKey'], { unique: true })
@Index(['knowledgebaseId', 'sourceDocumentIdSnapshot', 'consumer', 'extractionId'])
export class KnowledgeIdentityObservation extends TenantOrganizationBaseEntity {
    @ManyToOne(() => KnowledgeDocument, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'sourceDocumentIdSnapshot' })
    sourceDocument: KnowledgeDocument

    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @ManyToOne(() => KnowledgeIdentity, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'identityId' })
    identity: KnowledgeIdentity

    @Column({ type: 'uuid' })
    identityId: string

    @Column({ type: 'uuid' })
    sourceDocumentIdSnapshot: string

    @Column({ type: 'varchar', length: 128 })
    sourceContentHash: string

    @Column({ type: 'int' })
    sourcePublicationEpoch: number

    @Column({ type: 'varchar', length: 16 })
    consumer: 'wiki' | 'graph'

    @Column({ type: 'uuid' })
    extractionId: string

    @Column({ type: 'boolean', default: true })
    isCurrent: boolean

    @Column({ type: 'varchar', length: 512 })
    candidateKey: string

    @Column({ type: 'varchar', length: 64 })
    sourceKey: string

    @Column({ type: 'jsonb' })
    payload: KnowledgeIdentityObservationPayload

    @Column({ type: 'jsonb' })
    decision: KnowledgeIdentityDecision
}
