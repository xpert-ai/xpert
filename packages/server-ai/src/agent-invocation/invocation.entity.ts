import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'
import type {
    AgentInvocation,
    AgentTarget,
    StrategySource,
    AgentRuntimeObservation,
    AgentInvocationScope,
    TaskWaitRequest,
    TaskWaitReason
} from '@xpert-ai/plugin-sdk'

@Entity('agent_invocation')
@Index(['tenantId', 'organizationId', 'ownerId'])
export class AgentInvocationEntity extends TenantOrganizationBaseEntity {
    @Column({ type: 'timestamptz', default: () => 'now()', nullable: true }) nextObservationAt: Date | null
    @Column({ type: 'uuid', nullable: true }) observationLeaseToken: string | null
    @Column({ type: 'timestamptz', nullable: true }) observationLeaseUntil: Date | null
    @Column({ type: 'varchar', nullable: true }) observationError: string | null
    @Column({ type: 'varchar' }) ownerId: string
    @Column({ type: 'int', default: 0 }) revision: number
    @Column({ type: 'jsonb' }) invocation: AgentInvocation
    @Column({ type: 'jsonb' }) providerSource: StrategySource
}

@Entity('agent_runtime_binding')
export class AgentRuntimeBindingEntity extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar' }) title: string
    @Column({ type: 'jsonb' }) workspaceIds: string[]
    @Column({ type: 'jsonb' }) target: AgentTarget
    @Column({ type: 'boolean', default: true }) enabled: boolean
}

@Entity('agent_invocation_event')
@Index(['invocationId', 'revision'], { unique: true })
export class AgentInvocationEventEntity extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) invocationId: string
    @Column({ type: 'varchar' }) ownerId: string
    @Column({ type: 'int' }) revision: number
    @Column({ type: 'jsonb' }) observation: AgentRuntimeObservation
}

/** Durable dependency groups; table name preserves existing single-task checkpoints. */
@Entity('agent_invocation_wait')
@Index(['state', 'nextCheckAt'])
export class AgentInvocationWaitEntity extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar' }) ownerId: string
    @Column({ type: 'varchar' }) threadId: string
    @Column({ type: 'varchar' }) checkpointNamespace: string
    @Column({ type: 'varchar', default: 'waiting' }) state: 'waiting' | 'ready' | 'delivered' | 'stale' | 'blocked'
    @Column({ type: 'jsonb', nullable: true }) request: (TaskWaitRequest & { scope: AgentInvocationScope }) | null
    @Column({ type: 'varchar', nullable: true }) outcome: TaskWaitReason | null
    @Column({ type: 'timestamptz', nullable: true }) deadlineAt: Date | null
    @Column({ type: 'timestamptz', nullable: true }) unknownSince: Date | null
    @Column({ type: 'timestamptz' }) nextCheckAt: Date
    @Column({ type: 'uuid', nullable: true }) leaseToken: string | null
    @Column({ type: 'timestamptz', nullable: true }) leaseUntil: Date | null
    @Column({ type: 'varchar', nullable: true }) lastError: string | null
}
