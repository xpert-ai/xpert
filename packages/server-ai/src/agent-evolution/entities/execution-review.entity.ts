import type { IExecutionReview } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

@Entity('agent_evolution_execution_review')
@Index('UQ_evolution_review_execution', ['tenantId', 'organizationId', 'targetId', 'executionId'], { unique: true })
export class ExecutionReviewEntity extends TenantOrganizationBaseEntity implements IExecutionReview {
    declare id: string
    declare tenantId: string
    declare organizationId: string
    @Column({ type: 'varchar' }) targetId: string
    @Column({ type: 'uuid' }) executionId: string
    @Column({ type: 'uuid' }) projectId: string
    @Column({ type: 'uuid' }) conversationId: string
    @Column({ type: 'varchar' }) bundleHash: string
    @Column({ type: 'jsonb' }) receipt: IExecutionReview['receipt']
}
