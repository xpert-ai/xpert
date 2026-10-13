import type { IChatConversation, IXpertAgentExecution } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import type { McpAppInstanceSnapshot } from './mcp-app-instance-store.service'

/** Initial server provenance survives the runtime lease, but never its owning conversation/execution. */
@Entity('mcp_app_history')
@Index('IDX_mcp_app_history_conversation', ['tenantId', 'organizationId', 'conversationId'])
@Index('IDX_mcp_app_history_execution', ['executionId'])
export class McpAppHistory extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' })
    conversationId: string

    @ManyToOne('ChatConversation', { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'conversationId', foreignKeyConstraintName: 'FK_mcp_app_history_conversation' })
    conversation?: IChatConversation

    @Column({ type: 'uuid' })
    executionId: string

    @ManyToOne('XpertAgentExecution', { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'executionId', foreignKeyConstraintName: 'FK_mcp_app_history_execution' })
    execution?: IXpertAgentExecution

    @Column({ type: 'jsonb', select: false })
    snapshot: McpAppInstanceSnapshot
}
