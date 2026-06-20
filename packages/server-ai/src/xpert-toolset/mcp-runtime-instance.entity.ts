import { Column, Entity, Index } from 'typeorm'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import type { McpRuntimeOrigin, McpRuntimeStatus } from './provider/mcp/mcp-stdio-runtime'

@Entity('mcp_runtime_instance')
@Index(['tenantId', 'workspaceId', 'toolsetId'])
@Index(['pluginName', 'componentKey'])
@Index(['status', 'startedAt'])
@Index(['executionId'])
@Index(['appInstanceId'])
export class McpRuntimeInstanceEntity extends TenantOrganizationBaseEntity {
    @Column({ nullable: true })
    workspaceId?: string

    @Column({ nullable: true })
    toolsetId?: string

    @Column({ nullable: true })
    toolsetName?: string

    @Column()
    serverName: string

    @Column({ default: false })
    pluginManaged: boolean

    @Column({ nullable: true })
    pluginName?: string

    @Column({ nullable: true })
    componentKey?: string

    @Column({ nullable: true })
    pluginRuntimeId?: string

    @Column({ nullable: true })
    resourceInstallationId?: string

    @Column({ nullable: true })
    xpertId?: string

    @Column({ nullable: true })
    agentKey?: string

    @Column({ nullable: true })
    executionId?: string

    @Column({ nullable: true })
    conversationId?: string

    @Column({ nullable: true })
    appInstanceId?: string

    @Column({ type: 'varchar', default: 'agent-toolset' })
    origin: McpRuntimeOrigin

    @Column({ type: 'varchar' })
    status: McpRuntimeStatus

    @Column({ type: 'timestamptz' })
    startedAt: Date

    @Column({ type: 'timestamptz', nullable: true })
    idleExpiresAt?: Date

    @Column({ type: 'timestamptz', nullable: true })
    maxLifetimeExpiresAt?: Date

    @Column({ type: 'timestamptz', nullable: true })
    readyAt?: Date

    @Column({ type: 'timestamptz', nullable: true })
    closedAt?: Date

    @Column({ nullable: true })
    closeReason?: string

    @Column({ type: 'integer', nullable: true })
    startupDurationMs?: number

    @Column({ type: 'integer', nullable: true })
    durationMs?: number

    @Column({ type: 'integer', nullable: true })
    runnerPid?: number

    @Column({ type: 'integer', nullable: true })
    childPid?: number

    @Column({ type: 'text', nullable: true })
    stderrTail?: string

    @Column({ nullable: true })
    commandLabel?: string

    @Column({ nullable: true })
    commandHash?: string

    @Column({ type: 'jsonb', nullable: true })
    policySnapshot?: Record<string, unknown>
}
