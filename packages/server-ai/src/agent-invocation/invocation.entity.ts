import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'
import type { AgentInvocation, AgentTarget, StrategySource, AgentRuntimeObservation } from '@xpert-ai/plugin-sdk'

@Entity('agent_invocation')
@Index(['tenantId', 'organizationId', 'ownerId'])
export class AgentInvocationEntity extends TenantOrganizationBaseEntity {
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
