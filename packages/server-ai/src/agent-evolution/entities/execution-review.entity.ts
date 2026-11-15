import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { ExecutionReviewReceipt } from '@xpert-ai/contracts'

@Entity('agent_evolution_execution_review')
@Index('UQ_evolution_review_execution', ['tenantId', 'organizationId', 'targetId', 'executionId'], { unique: true })
export class ExecutionReviewEntity {
    @PrimaryGeneratedColumn('uuid') id: string
    @Column({ type: 'uuid' }) tenantId: string
    @Column({ type: 'uuid' }) organizationId: string
    @Column({ type: 'varchar' }) targetId: string
    @Column({ type: 'uuid' }) executionId: string
    @Column({ type: 'uuid' }) projectId: string
    @Column({ type: 'uuid' }) conversationId: string
    @Column({ type: 'varchar' }) bundleHash: string
    @Column({ type: 'jsonb' }) receipt: ExecutionReviewReceipt
}
