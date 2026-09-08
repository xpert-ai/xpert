import { KnowledgeWikiInvocationStatus } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Knowledgebase } from '../../knowledgebase.entity'
import { KnowledgeWikiJob } from './knowledge-wiki-job.entity'
import type { KnowledgeWikiModelOutput } from '../types'

type KnowledgeWikiReconciliationStatus = 'not_available' | 'pending' | 'recovered' | 'not_executed' | 'indeterminate'

type KnowledgeWikiBillingStatus = 'pending' | 'delivered' | 'failed'

@Entity('knowledge_wiki_model_invocation')
@Index(['requestId'], { unique: true })
@Index(['knowledgebaseId', 'status'])
@Index(['jobId', 'generationAttempt', 'stage', 'callOrdinal', 'inputFingerprint'], { unique: true })
export class KnowledgeWikiModelInvocation extends TenantOrganizationBaseEntity {
    @ManyToOne(() => Knowledgebase, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    knowledgebase: Knowledgebase

    @RelationId((invocation: KnowledgeWikiModelInvocation) => invocation.knowledgebase)
    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @ManyToOne(() => KnowledgeWikiJob, { nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
    @JoinColumn()
    job: KnowledgeWikiJob

    @RelationId((invocation: KnowledgeWikiModelInvocation) => invocation.job)
    @Column({ type: 'uuid' })
    jobId: string

    @Column({ type: 'varchar', length: 1024 })
    requestId: string

    @Column({ type: 'varchar', length: 32 })
    stage: 'map' | 'dedup' | 'reduce'

    @Column({ type: 'int' })
    callOrdinal: number

    @Column({ type: 'int' })
    generationAttempt: number

    @Column({ type: 'varchar', length: 128 })
    inputFingerprint: string

    @Column({ type: 'varchar', length: 32, default: 'prepared' })
    status: KnowledgeWikiInvocationStatus

    @Column({ type: 'varchar', length: 32, default: 'not_available' })
    reconciliationStatus: KnowledgeWikiReconciliationStatus

    @Column({ type: 'varchar', length: 120, nullable: true })
    providerRequestId?: string | null

    @Column({ type: 'uuid' })
    modelId: string

    @Column({ type: 'varchar', length: 200 })
    modelName: string

    @Column({ type: 'uuid' })
    billingPrincipalId: string

    @Column({ type: 'jsonb', nullable: true })
    tokenUsage?: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
        estimatedTokens?: number
    } | null

    @Column({ type: 'jsonb', nullable: true })
    structuredOutput?: KnowledgeWikiModelOutput | null

    @Column({ type: 'varchar', length: 32, default: 'pending' })
    billingStatus: KnowledgeWikiBillingStatus

    @Column({ type: 'varchar', length: 120, nullable: true })
    errorCode?: string | null

    @Column({ type: 'text', nullable: true })
    error?: string | null

    @Column({ type: 'timestamptz', nullable: true })
    reconciliationDeadline?: Date | null

    @Column({ type: 'int', default: 0 })
    reconciliationAttempts: number

    @Column({ type: 'timestamptz', nullable: true })
    completedAt?: Date | null
}
