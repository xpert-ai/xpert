// Only the authorized snapshot may select the actor and the remote server for a revived App.
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { MCPServerType, type IXpertToolset, type TMCPSchema } from '@xpert-ai/contracts'
import { RequestContext, type ActorTokenRuntimeFactory } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { getContextEnvState } from '../environment/utils'
import type { McpAppInstanceSnapshot } from './mcp-app-instance-store.service'

const actorVariable = /\{\{\{?\s*&?\s*env\.oidc_token\s*\}?\}\}/

type ActorScope = { tenantId?: string; organizationId?: string | null; userId?: string }

export type McpAppActorLease = { scope: ActorScope; expiresAt: number }

export function assertMcpAppActorScope(scope: ActorScope) {
    if (
        !scope.userId ||
        !scope.tenantId ||
        RequestContext.currentUserId() !== scope.userId ||
        RequestContext.currentTenantId() !== scope.tenantId ||
        (RequestContext.getOrganizationId() ?? null) !== (scope.organizationId ?? null)
    ) {
        throw new ForbiddenException(t('server-ai:Error.ActorTokenRuntimeIdentityMismatch'))
    }
}

export async function prepareMcpAppActorConnection(
    toolset: IXpertToolset,
    schema: TMCPSchema,
    environment: Record<string, unknown> | null,
    snapshot: McpAppInstanceSnapshot,
    actorTokens: ActorTokenRuntimeFactory
): Promise<{ schema: TMCPSchema; environment: Record<string, unknown>; actor?: McpAppActorLease }> {
    const servers = schema.servers ?? schema.mcpServers ?? {}
    const source = Object.entries(servers).find(([name]) => (name || toolset.name || 'default') === snapshot.serverName)
    if (!source) throw new NotFoundException(t('server-ai:Error.AgentResourceUnavailable'))

    const [name, server] = source
    // A card addresses one server. Sibling transports do not receive its actor environment.
    const sourceSchema: TMCPSchema = { mcpServers: { [name]: server } }
    const headerTemplates = Object.values(server.headers ?? {})
    if (server.auth?.type === 'api_key') headerTemplates.push(server.auth.value)
    if (
        ![MCPServerType.HTTP, MCPServerType.SSE].includes(server.type) ||
        !headerTemplates.some((value) => actorVariable.test(value))
    ) {
        return { schema, environment: environment ?? {} }
    }
    const execution = snapshot.executionContext
    const scope = {
        userId: snapshot.userId,
        tenantId: snapshot.tenantId,
        organizationId: execution?.organizationId === undefined ? snapshot.organizationId : execution.organizationId
    }
    assertMcpAppActorScope(scope)
    if (
        !execution?.xpertId ||
        (snapshot.organizationId && scope.organizationId !== snapshot.organizationId) ||
        snapshot.toolsetId !== toolset.id ||
        snapshot.tenantId !== toolset.tenantId ||
        snapshot.workspaceId !== toolset.workspaceId ||
        (snapshot.organizationId ?? null) !== (toolset.organizationId ?? null)
    ) {
        throw new ForbiddenException(t('server-ai:Error.ActorTokenRuntimeIdentityMismatch'))
    }
    const token = await actorTokens
        .createScopedApi({
            ...execution,
            ...scope,
            workspaceId: snapshot.workspaceId
        })
        .getToken()
    return {
        schema: sourceSchema,
        environment: { ...environment, env: { ...getContextEnvState(environment), oidc_token: token.token } },
        actor: { scope, expiresAt: Date.parse(token.expiresAt) }
    }
}
