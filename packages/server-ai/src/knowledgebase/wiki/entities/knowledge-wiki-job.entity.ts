import { KnowledgeWikiJobStatus, KnowledgeWikiJobType } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Knowledgebase } from '../../knowledgebase.entity'

@Entity('knowledge_wiki_job')
@Index(['knowledgebaseId', 'jobKey'], { unique: true })
@Index(['knowledgebaseId', 'status', 'isCurrent'])
@Index(['rootJobId', 'status'])
export class KnowledgeWikiJob extends TenantOrganizationBaseEntity {
    @ManyToOne(() => Knowledgebase, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    knowledgebase: Knowledgebase

    @RelationId((job: KnowledgeWikiJob) => job.knowledgebase)
    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @Column({ type: 'uuid', nullable: true })
    rootJobId?: string | null

    @Column({ type: 'uuid', nullable: true })
    parentJobId?: string | null

    @Column({ type: 'uuid', nullable: true })
    sourceDocumentIdSnapshot?: string | null

    @Column({ type: 'varchar', length: 768, nullable: true })
    pageKey?: string | null

    @Column({ type: 'int', nullable: true })
    sourceLifecycleGeneration?: number | null

    @Column({ type: 'int', nullable: true })
    sourcePublicationEpoch?: number | null

    @Column({ type: 'varchar', length: 128, nullable: true })
    sourceContentHash?: string | null

    @Column({ type: 'varchar', length: 768 })
    jobKey: string

    @Column({ type: 'varchar', length: 32 })
    type: KnowledgeWikiJobType

    @Column({ type: 'varchar', length: 32, default: 'queued' })
    status: KnowledgeWikiJobStatus

    @Column({ type: 'boolean', default: true })
    isCurrent: boolean

    @Column({ type: 'int' })
    generationRevision: number

    @Column({ type: 'int', default: 0 })
    executionAttempt: number

    @Column({ type: 'int', default: 0 })
    generationAttempt: number

    @Column({ type: 'varchar', length: 128 })
    configFingerprint: string

    @Column({ type: 'varchar', length: 120 })
    generatorVersion: string

    @Column({ type: 'uuid', nullable: true })
    billingPrincipalId?: string | null

    @Column({ type: 'jsonb', nullable: true })
    spendEnvelope?: {
        maxModelInvocations: number
        maxEstimatedTokens: number
    } | null

    @Column({ type: 'int', default: 0 })
    expectedChildren: number

    @Column({ type: 'int', default: 0 })
    succeededChildren: number

    @Column({ type: 'int', default: 0 })
    failedChildren: number

    @Column({ type: 'varchar', length: 120, nullable: true })
    errorCode?: string | null

    @Column({ type: 'text', nullable: true })
    error?: string | null

    @Column({ type: 'text', nullable: true })
    dispatchError?: string | null

    @Column({ type: 'int', default: 0 })
    dispatchAttempts: number

    @Column({ type: 'timestamptz', nullable: true })
    dispatchAfter?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    lockedAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    leaseExpiresAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    heartbeatAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    completedAt?: Date | null
}
