// Original runtime grants and authoring grants are distinct. Reconnection cannot select a new endpoint.
import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { User } from '@xpert-ai/server-core'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { runWithCapturedRequestContext } from '../../shared/request-context'
import { getPluginManagedMcpOptions } from '../../xpert-toolset/provider/mcp/plugin-managed-runtime'
import { resolveMcpServerName } from '../../xpert-toolset/provider/mcp/server-name'
import { createMCPClient } from '../../xpert-toolset/provider/mcp/types'
import { McpClientConnectionService } from '../runtime/mcp-client-connection.service'
import { mcpConnectionVersion } from '../runtime/mcp-connection-version'
import { LangChainMcpConnection } from '../connection/langchain-mcp-connection'
import { McpConsumer } from '../mcp-consumer'
import { McpRemoteOperation } from './mcp-operation.entity'
import type { McpOperationScope } from '@xpert-ai/contracts'
import { requestMcpControl } from './mcp-control.client'
import { mcpOperationScopeSchema } from './mcp-operation.schema'
import { mcpStopSchema, mcpStopServerSchema } from './mcp-stop.schema'
import { McpControlError } from './mcp-control.error'
import {
    AuthorizeAssistantMcpQuery,
    AuthorizePublicationMcpQuery,
    currentMcpPublicationAuthority,
    type McpOperationAuthority
} from './mcp-operation-authority'

@Injectable()
export class McpOperationTransport {
    constructor(
        private readonly connections: McpClientConnectionService,
        @InjectRepository(XpertToolset) private readonly toolsets: Repository<XpertToolset>,
        @InjectRepository(User) private readonly users: Repository<User>,
        private readonly queries: QueryBus
    ) {}

    private toolsetWhere(scope: Pick<McpOperationScope, 'actor' | 'toolsetId'>, workspaceId?: string) {
        const base = { id: scope.toolsetId, tenantId: scope.actor.tenantId, ...(workspaceId ? { workspaceId } : {}) }
        return scope.actor.organizationId
            ? [
                  { ...base, organizationId: scope.actor.organizationId },
                  { ...base, organizationId: IsNull() }
              ]
            : [{ ...base, organizationId: IsNull() }]
    }
    async prepare(toolsetId: string, serverName: string, toolName: string, authority?: McpOperationAuthority) {
        const actor = {
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId() ?? null,
            userId: RequestContext.currentUserId() ?? null
        }
        const toolset = await this.toolsets.findOne({
            where: this.toolsetWhere({ actor, toolsetId }),
            relations: ['tools']
        })
        const scope = mcpOperationScopeSchema.parse({
            actor,
            toolsetId,
            serverName,
            workspaceId: toolset?.workspaceId,
            authority: currentMcpPublicationAuthority() ?? authority ?? { kind: 'workspace' }
        })
        await this.authorize(scope, toolName)
        return {
            scope,
            connectionVersion: mcpConnectionVersion(toolset),
            reconnectable: !getPluginManagedMcpOptions(toolset)
        }
    }
    private userScope(scope: McpOperationScope) {
        const { userId, organizationId, tenantId } = scope.actor
        if (!userId || !organizationId) throw new McpControlError('actor')
        return {
            ...scope,
            actor: { userId, organizationId, tenantId },
            signal: AbortSignal.timeout(10000),
            deadlineAt: Date.now() + 10000
        }
    }
    private async authorize(scope: McpOperationScope, toolName: string) {
        const grant = scope.authority
        if (grant?.kind === 'publication') {
            if (
                grant.principal.tenantId !== scope.actor.tenantId ||
                (grant.principal.organizationId ?? null) !== scope.actor.organizationId ||
                (grant.principal.userId ?? null) !== scope.actor.userId
            )
                throw new McpControlError('scope')
            await this.queries.execute(
                new AuthorizePublicationMcpQuery(grant.principal, scope.toolsetId, scope.serverName, toolName)
            )
        } else if (grant?.kind === 'assistant') {
            if (!scope.actor.userId) throw new McpControlError('actor')
            await this.queries.execute(
                new AuthorizeAssistantMcpQuery(grant.xpertId, scope.workspaceId, grant.projectId)
            )
        } else await this.connections.pin(this.userScope(scope))
    }
    private async withActor<T>(row: McpRemoteOperation, work: () => Promise<T>) {
        const { scope } = row.record
        const user = scope.actor.userId
            ? await this.users.findOne({
                  where: { id: scope.actor.userId, tenantId: scope.actor.tenantId },
                  relations: ['organizations', 'role', 'role.rolePermissions']
              })
            : null
        if (scope.actor.userId && !user) throw new McpControlError('actor')
        return runWithCapturedRequestContext(
            {
                user,
                headers: {
                    'tenant-id': scope.actor.tenantId,
                    ...(scope.actor.organizationId ? { 'organization-id': scope.actor.organizationId } : {})
                }
            },
            work
        )
    }
    private async originalToolset(row: McpRemoteOperation) {
        const scope = row.record.scope
        const toolset = await this.toolsets.findOneOrFail({
            where: this.toolsetWhere(scope, scope.workspaceId),
            relations: ['tools']
        })
        if (mcpConnectionVersion(toolset) !== row.record.connectionVersion) throw new McpControlError('connection')
        return toolset
    }
    assertOriginal(row: McpRemoteOperation) {
        return this.withActor(row, async () => {
            await this.authorize(row.record.scope, row.record.identity.toolName)
            await this.originalToolset(row)
        })
    }
    /** Reconnect only the saved HTTP server; never execute initialization scripts or unrelated stdio entries. */
    private async connect<T>(row: McpRemoteOperation, work: (consumer: McpConsumer) => Promise<T>) {
        if (!row.record.reconnectable) throw new McpControlError('transport')
        const { scope } = row.record
        const toolset = await this.originalToolset(row)
        if (getPluginManagedMcpOptions(toolset)) throw new McpControlError('connection')
        const schema = mcpStopSchema.parse(JSON.parse(toolset.schema))
        const selected = Object.entries(schema.servers ?? schema.mcpServers ?? {}).find(
            ([name]) => resolveMcpServerName(name, toolset.name) === scope.serverName
        )
        if (!selected) throw new McpControlError('transport')
        const server = mcpStopServerSchema.parse(selected[1])
        const connection = await createMCPClient(
            toolset,
            { servers: { [selected[0]]: server } },
            { workspaceId: scope.workspaceId },
            undefined,
            {
                tenantId: scope.actor.tenantId,
                organizationId: scope.actor.organizationId ?? undefined,
                userId: scope.actor.userId ?? undefined
            }
        )
        try {
            return await work(new McpConsumer(new LangChainMcpConnection(connection.client)))
        } finally {
            await connection.destroy?.()
            await connection.client.close()
        }
    }
    /** Stop-only retained capability; it never returns business results or supplies new input. */
    async terminate(row: McpRemoteOperation, original?: McpConsumer) {
        const stop = async (consumer: McpConsumer) => {
            if (row.record.serverId) return (await requestMcpControl(consumer, row, 'terminate')).receipt
            if (row.record.taskId)
                await consumer.tasks.cancel(row.record.taskId, row.record.scope.serverName, AbortSignal.timeout(10000))
            return undefined
        }
        if (original) return stop(original)
        return this.withActor(row, async () => {
            if (!row.record.scope.authority || row.record.scope.authority.kind === 'workspace') {
                const version = await this.connections.pinForStop(this.userScope(row.record.scope))
                if (version !== row.record.connectionVersion) throw new McpControlError('connection')
            }
            return this.connect(row, stop)
        })
    }
    async withConnection<T>(row: McpRemoteOperation, work: (consumer: McpConsumer) => Promise<T>) {
        return this.withActor(row, async () => {
            await this.authorize(row.record.scope, row.record.identity.toolName)
            const result = await this.connect(row, work)
            await this.authorize(row.record.scope, row.record.identity.toolName)
            await this.originalToolset(row)
            return result
        })
    }
}
