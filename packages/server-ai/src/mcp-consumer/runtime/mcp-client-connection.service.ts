// Invariants: identities and connection configuration stay with the platform. Recheck access
// around remote I/O; a previously authorized session never survives connection/workspace revocation.
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { t } from 'i18next'
import { XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { RequestContext, type McpClientScope } from '@xpert-ai/plugin-sdk'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { ToolRuntimeService } from '../../tool-runtime'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { MCPToolset } from '../../xpert-toolset/provider/mcp/mcp-toolset'
import { McpConsumer } from '../mcp-consumer'
import { connectionScope } from './mcp-client-runtime.schema'

/** Internal session; protocol clients and credentials never cross the plugin SDK boundary. */
export interface McpClientSession {
    consumer: McpConsumer
    scope: McpClientScope
    enabledToolNames: ReadonlySet<string>
    assertAccess(): Promise<void>
}

@Injectable()
export class McpClientConnectionService {
    constructor(
        private readonly runtime: ToolRuntimeService,
        private readonly workspaces: XpertWorkspaceAccessService,
        @InjectRepository(XpertToolset) private readonly toolsets: Repository<XpertToolset>
    ) {}

    private async authorize(scope: McpClientScope) {
        if (
            scope.actor.tenantId !== RequestContext.currentTenantId() ||
            scope.actor.organizationId !== RequestContext.getOrganizationId() ||
            scope.actor.userId !== RequestContext.currentUserId()
        )
            throw new ForbiddenException(
                t('server-ai:Error.McpClientAccessDenied', { defaultValue: 'MCP connection access denied.' })
            )
        await this.workspaces.assertCanRead(scope.workspaceId)
        const connection = await this.toolsets.findOne({
            where: {
                id: scope.toolsetId,
                tenantId: scope.actor.tenantId,
                organizationId: scope.actor.organizationId,
                workspaceId: scope.workspaceId,
                category: XpertToolsetCategoryEnum.MCP
            },
            relations: ['tools']
        })
        if (!connection)
            throw new ForbiddenException(
                t('server-ai:Error.McpClientAccessDenied', { defaultValue: 'MCP connection access denied.' })
            )
        // Include tool selection as well as connection changes in the revocation check.
        return JSON.stringify({
            schema: connection.schema,
            options: connection.options,
            updatedAt: connection.updatedAt,
            tools: connection.tools
                ?.map((tool) => ({
                    name: tool.name,
                    enabled: tool.enabled,
                    disabled: tool.disabled,
                    updatedAt: tool.updatedAt
                }))
                .sort((a, b) => a.name.localeCompare(b.name))
        })
    }

    async withConnection<T>(
        original: McpClientScope,
        operation: (session: McpClientSession) => Promise<T>
    ): Promise<T> {
        const { signal, ...input } = original
        const parsed = connectionScope.parse(input)
        signal.throwIfAborted()
        const remaining = Math.min(30000, parsed.deadlineAt - Date.now())
        if (remaining <= 0) throw new Error('MCP_CLIENT_TIMEOUT')
        const controller = new AbortController(),
            scope = { ...parsed, signal: controller.signal }
        let runtime: MCPToolset | undefined
        const abort = () => controller.abort()
        signal.addEventListener('abort', abort, { once: true })
        const timer = setTimeout(abort, remaining)
        let rejectAbort: () => void
        const aborted = new Promise<never>((_resolve, reject) => {
            rejectAbort = () => {
                void runtime?.close().catch(() => undefined)
                reject(new Error('MCP_CLIENT_TIMEOUT'))
            }
            controller.signal.addEventListener('abort', rejectAbort, { once: true })
        })
        const work = async () => {
            try {
                const version = await this.authorize(scope)
                controller.signal.throwIfAborted()
                const loaded = await this.runtime.loadToolsets({
                    source: 'api',
                    tenantId: scope.actor.tenantId,
                    organizationId: scope.actor.organizationId,
                    workspaceId: scope.workspaceId,
                    toolsetIds: [scope.toolsetId],
                    principal: { type: 'user', id: scope.actor.userId, userId: scope.actor.userId },
                    signal: controller.signal
                })
                if (loaded.length !== 1 || !(loaded[0] instanceof MCPToolset)) {
                    await Promise.allSettled(loaded.map((item) => item.close()))
                    throw new Error('MCP_CLIENT_CONNECTION_UNAVAILABLE')
                }
                runtime = loaded[0]
                controller.signal.throwIfAborted()
                const consumer = await runtime.getMcpConsumer()
                controller.signal.throwIfAborted()
                if (!consumer.connection.serverNames().includes(scope.serverName))
                    throw new Error('MCP_CLIENT_SERVER_UNAVAILABLE')
                const assertAccess = async () => {
                    if (version !== (await this.authorize(scope))) throw new Error('MCP_CLIENT_CONNECTION_CHANGED')
                    controller.signal.throwIfAborted()
                }
                await assertAccess()
                const result = await operation({
                    consumer,
                    scope,
                    enabledToolNames: new Set(runtime.getTools().map((tool) => tool.name)),
                    assertAccess
                })
                await assertAccess()
                return result
            } finally {
                await runtime?.close()
            }
        }
        try {
            return await Promise.race([work(), aborted])
        } catch (error) {
            const code =
                error instanceof Error && SAFE_ERRORS.has(error.message) ? error.message : 'MCP_CLIENT_UNAVAILABLE'
            throw new BadRequestException({
                code,
                message: t('server-ai:Error.McpClientUnavailable', {
                    defaultValue: 'The MCP operation is unavailable, changed, or returned an invalid result.'
                })
            })
        } finally {
            clearTimeout(timer)
            signal.removeEventListener('abort', abort)
            controller.signal.removeEventListener('abort', rejectAbort)
            controller.abort()
        }
    }
}

const SAFE_ERRORS = new Set([
    'MCP_CLIENT_TOOL_CHANGED',
    'MCP_CLIENT_ARGUMENTS_INVALID',
    'MCP_CLIENT_INTERACTION_REQUIRED',
    'MCP_CLIENT_TOOL_ERROR',
    'MCP_CLIENT_OUTPUT_INVALID',
    'MCP_CLIENT_TIMEOUT',
    'MCP_CLIENT_SIZE_LIMIT',
    'MCP_CLIENT_CONNECTION_CHANGED',
    'MCP_CLIENT_SERVER_UNAVAILABLE',
    'MCP_CLIENT_AMBIGUOUS_TOOLS'
])
