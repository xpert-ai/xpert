import type { IAgentEventBinding, IAgentEventPartition, IAgentEventInbox } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Check, Column, Entity, ForeignKey, Index, Unique } from 'typeorm'

@Entity('agent_event_binding')
@Unique('UQ_agent_event_binding_scope', ['id', 'tenantId', 'organizationId'])
@Unique('agent_event_binding_tenantId_organizationId_plugin_adapter__key', [
    'tenantId',
    'organizationId',
    'plugin',
    'adapter',
    'sourceBindingRef',
    'xpertId'
])
@Check('agent_event_binding_revision_check', 'revision > 0')
@Check('agent_event_binding_state_check', "state IN ('configuring','enabled','paused','revoked')")
@Index('idx_agent_event_binding_inbox_owner', ['tenantId', 'organizationId', 'userId', 'xpertId'])
@Index('idx_agent_event_binding_due', ['nextScan', 'id'], { where: "state='enabled'" })
@Check('CHK_agent_event_binding_scope', '"tenantId" IS NOT NULL AND "organizationId" IS NOT NULL')
export class AgentEventBinding extends TenantOrganizationBaseEntity implements IAgentEventBinding {
    declare id: string
    declare tenantId: string
    declare organizationId: string
    @Column({ type: 'uuid' }) workspaceId: string
    @Column({ type: 'uuid', nullable: true }) projectId: string | null
    @Column({ type: 'uuid' }) xpertId: string
    @Column({ type: 'uuid' }) userId: string
    @Column({ type: 'varchar', length: 200 }) plugin: string
    @Column({ type: 'varchar', length: 200 }) adapter: string
    @Column({ type: 'varchar', length: 256 }) sourceBindingRef: string
    @Column({ type: 'timestamptz' }) publishedAt: Date
    @Column({ type: 'int' }) revision: number
    @Column({ type: 'varchar' }) state: IAgentEventBinding['state']
    @Column({ type: 'timestamptz', default: () => 'now()' }) nextScan: Date
    @Column({ type: 'boolean', default: true }) capture: boolean
    @Column({ type: 'timestamptz', nullable: true }) lastScanAt: Date | null
    @Column({ type: 'varchar', length: 80, nullable: true }) lastError: string | null
}

@Entity('agent_event_partition')
@ForeignKey(() => AgentEventBinding, ['binding', 'tenantId', 'organizationId'], ['id', 'tenantId', 'organizationId'], {
    name: 'agent_event_partition_binding_fkey'
})
@Unique('agent_event_partition_binding_kind_subject_key', ['binding', 'kind', 'subject'])
@Unique('agent_event_partition_binding_id_key', ['binding', 'id'])
@Check('CHK_agent_event_partition_scope', '"tenantId" IS NOT NULL AND "organizationId" IS NOT NULL')
export class AgentEventPartition extends TenantOrganizationBaseEntity implements IAgentEventPartition {
    declare id: string
    declare tenantId: string
    declare organizationId: string
    @Column({ type: 'uuid' }) binding: string
    @Column({ type: 'varchar', length: 256 }) kind: string
    @Column({ type: 'varchar', length: 256 }) subject: string
    @Column({ type: 'uuid', nullable: true }) owner: string | null
    @Column({ type: 'bigint', default: 0 }) fence: string
    @Column({ type: 'timestamptz', nullable: true }) expires: Date | null
}

@Entity('agent_event_inbox')
@ForeignKey(() => AgentEventBinding, ['binding', 'tenantId', 'organizationId'], ['id', 'tenantId', 'organizationId'], {
    name: 'agent_event_inbox_binding_fkey'
})
@ForeignKey(() => AgentEventPartition, ['binding', 'partition'], ['binding', 'id'], {
    name: 'agent_event_inbox_binding_partition_fkey'
})
@Unique('agent_event_inbox_binding_sourceEventId_key', ['binding', 'sourceEventId'])
@Unique('agent_event_inbox_seq_key', ['seq'])
@Check(
    'agent_event_inbox_state_check',
    "state IN ('pending','processing','retry_wait','handled','ignored','blocked','isolated')"
)
@Index('idx_agent_event_inbox_binding_received', ['binding', 'receivedAt', 'seq'])
@Index('idx_agent_event_partition_head', ['partition', 'seq'], {
    where: "state IN ('pending','processing','retry_wait')"
})
@Check('CHK_agent_event_inbox_scope', '"tenantId" IS NOT NULL AND "organizationId" IS NOT NULL')
export class AgentEventInbox extends TenantOrganizationBaseEntity implements IAgentEventInbox {
    declare id: string
    declare tenantId: string
    declare organizationId: string
    @Column({ type: 'uuid' }) binding: string
    @Column({ type: 'uuid' }) partition: string
    @Column({ type: 'varchar', length: 256 }) sourceEventId: string
    @Column({ type: 'jsonb' }) event: IAgentEventInbox['event']
    @Column({ type: 'char', length: 64 }) fingerprint: string
    @Column({ type: 'bigint', generated: 'identity', generatedIdentity: 'ALWAYS' }) seq: string
    @Column({ type: 'varchar', default: 'pending' }) state: IAgentEventInbox['state']
    @Column({ type: 'int', default: 0 }) attempt: number
    @Column({ type: 'timestamptz', default: () => 'now()' }) due: Date
    @Column({ type: 'timestamptz', default: () => 'now()' }) receivedAt: Date
    @Column({ type: 'int', default: 0 }) conflictCount: number
    @Column({ type: 'jsonb', nullable: true }) decision: IAgentEventInbox['decision']
    @Column({ type: 'varchar', length: 80, nullable: true }) error: string | null
}

export const AGENT_EVENT_ENTITIES = [AgentEventBinding, AgentEventPartition, AgentEventInbox]
