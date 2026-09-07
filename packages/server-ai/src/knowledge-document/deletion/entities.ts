import { KnowledgeDeletionStatus } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId, VersionColumn } from 'typeorm'
import { KnowledgeDocument } from '../document.entity'

export type KnowledgeDocumentDeletionManifest = {
    affectedWikiPageIds: string[]
    affectedWikiVersionIds: string[]
    affectedGraphEntityIds: string[]
    affectedGraphRelationIds: string[]
    externalArtifacts: Array<{
        kind: 'document_vector' | 'wiki_vector' | 'graph_vector' | 'parser_artifact' | 'staging_artifact'
        key: string
        ownership: 'owned' | 'shared' | 'unknown'
    }>
}

export type KnowledgeDocumentCleanupOutcome = {
    ownershipVerified: boolean
    deleted: boolean
    alreadyAbsent: boolean
    providerRequestId?: string | null
}

export type KnowledgeDocumentPublicationArtifact = {
    kind: 'document_vector' | 'wiki_vector' | 'graph_vector' | 'parser_artifact' | 'staging_artifact'
    key: string
    idempotencyKey: string
    status: 'prepared' | 'written' | 'promoted' | 'compensated' | 'indeterminate'
}

export type KnowledgeDocumentPublicationAttemptStatus =
    | 'prepared'
    | 'running'
    | 'published'
    | 'compensating'
    | 'compensated'
    | 'failed'
    | 'indeterminate'

@Entity('knowledge_document_deletion_intent')
@Index(['knowledgebaseId', 'sourceDocumentIdSnapshot'], { unique: true, where: `"status" <> 'completed'` })
@Index(['knowledgebaseId', 'status', 'acceptedAt'])
export class KnowledgeDocumentDeletionIntent extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @ManyToOne(() => KnowledgeDocument, { nullable: true, onUpdate: 'CASCADE', onDelete: 'SET NULL' })
    @JoinColumn()
    document?: KnowledgeDocument | null

    @RelationId((intent: KnowledgeDocumentDeletionIntent) => intent.document)
    @Column({ type: 'uuid', nullable: true })
    documentId?: string | null

    @Column({ type: 'uuid' })
    sourceDocumentIdSnapshot: string

    @Column({ type: 'int' })
    expectedDocumentVersion: number

    @Column({ type: 'int' })
    sourceLifecycleGeneration: number

    @Column({ type: 'int' })
    publicationEpoch: number

    @Column({ type: 'uuid' })
    requestedById: string

    @Column({ type: 'uuid', nullable: true })
    billingPrincipalId?: string | null

    @Column({ type: 'varchar', length: 32, default: 'prepared' })
    status: KnowledgeDeletionStatus

    @Column({ type: 'jsonb' })
    manifest: KnowledgeDocumentDeletionManifest

    @Column({ type: 'varchar', length: 64, nullable: true })
    failedStage?: string | null

    @Column({ type: 'varchar', length: 120, nullable: true })
    errorCode?: string | null

    @Column({ type: 'text', nullable: true })
    error?: string | null

    @Column({ type: 'int', default: 0 })
    executionAttempt: number

    @Column({ type: 'timestamptz' })
    acceptedAt: Date

    @Column({ type: 'timestamptz', nullable: true })
    lockedAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    leaseExpiresAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    completedAt?: Date | null

    @VersionColumn({ type: 'int', default: 1 })
    version: number
}

@Entity('knowledge_document_deletion_cleanup_receipt')
@Index(['intentId', 'receiptKey'], { unique: true })
export class KnowledgeDocumentDeletionCleanupReceipt extends TenantOrganizationBaseEntity {
    @ManyToOne(() => KnowledgeDocumentDeletionIntent, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    intent: KnowledgeDocumentDeletionIntent

    @RelationId((receipt: KnowledgeDocumentDeletionCleanupReceipt) => receipt.intent)
    @Column({ type: 'uuid' })
    intentId: string

    @Column({ type: 'varchar', length: 1024 })
    receiptKey: string

    @Column({ type: 'varchar', length: 48 })
    artifactKind: KnowledgeDocumentPublicationArtifact['kind']

    @Column({ type: 'text' })
    artifactKey: string

    @Column({ type: 'varchar', length: 32, default: 'pending' })
    status: 'pending' | 'succeeded' | 'failed' | 'indeterminate'

    @Column({ type: 'jsonb', nullable: true })
    outcome?: KnowledgeDocumentCleanupOutcome | null

    @Column({ type: 'int', default: 0 })
    attempt: number

    @Column({ type: 'text', nullable: true })
    error?: string | null

    @Column({ type: 'timestamptz', nullable: true })
    completedAt?: Date | null
}

@Entity('knowledge_document_publication_attempt')
@Index(['knowledgebaseId', 'documentIdSnapshot', 'publicationEpoch'])
@Index(['knowledgebaseId', 'status', 'leaseExpiresAt'])
export class KnowledgeDocumentPublicationAttempt extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @ManyToOne(() => KnowledgeDocument, { nullable: true, onUpdate: 'CASCADE', onDelete: 'SET NULL' })
    @JoinColumn()
    document?: KnowledgeDocument | null

    @RelationId((attempt: KnowledgeDocumentPublicationAttempt) => attempt.document)
    @Column({ type: 'uuid', nullable: true })
    documentId?: string | null

    @Column({ type: 'uuid' })
    documentIdSnapshot: string

    @Column({ type: 'varchar', length: 48 })
    producerKind: 'document' | 'chunk' | 'graph' | 'wiki' | 'embedding_rebuild'

    @Column({ type: 'int' })
    publicationEpoch: number

    @Column({ type: 'varchar', length: 32, default: 'prepared' })
    status: KnowledgeDocumentPublicationAttemptStatus

    @Column({ type: 'varchar', length: 32, default: 'pending' })
    relationPublicationStatus: 'pending' | 'published' | 'failed'

    @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
    artifacts: KnowledgeDocumentPublicationArtifact[]

    @Column({ type: 'timestamptz', nullable: true })
    lockedAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    leaseExpiresAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    heartbeatAt?: Date | null

    @Column({ type: 'varchar', length: 120, nullable: true })
    errorCode?: string | null

    @Column({ type: 'text', nullable: true })
    error?: string | null

    @Column({ type: 'timestamptz', nullable: true })
    completedAt?: Date | null
}

@Entity('knowledge_document_publication_attempt_source')
@Index(['attemptId', 'documentIdSnapshot'], { unique: true })
@Index(['knowledgebaseId', 'documentIdSnapshot', 'publicationEpoch'])
export class KnowledgeDocumentPublicationAttemptSource extends TenantOrganizationBaseEntity {
    @ManyToOne(() => KnowledgeDocumentPublicationAttempt, {
        nullable: false,
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    attempt: KnowledgeDocumentPublicationAttempt

    @RelationId((source: KnowledgeDocumentPublicationAttemptSource) => source.attempt)
    @Column({ type: 'uuid' })
    attemptId: string

    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @Column({ type: 'uuid' })
    documentIdSnapshot: string

    @Column({ type: 'int' })
    publicationEpoch: number

    @Column({ type: 'varchar', length: 128 })
    contentHash: string
}
