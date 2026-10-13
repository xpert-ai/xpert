import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { IsNull } from 'typeorm'
import { t } from 'i18next'

export interface AgentPluginScope {
    tenantId: string
    organizationId: string | null
}

export function agentPluginScope(): AgentPluginScope {
    const tenantId = RequestContext.currentTenantId()
    if (!tenantId) throw new ForbiddenException(t('server-ai:Error.AgentResourceScopeMismatch'))
    return { tenantId, organizationId: RequestContext.getOrganizationId() ?? null }
}

// TypeORM ignores bare null/undefined in WHERE clauses; tenant scope must mean IS NULL.
export function agentPluginScopeWhere(scope: AgentPluginScope) {
    return { tenantId: scope.tenantId, organizationId: scope.organizationId ?? IsNull() }
}

export function visibleAgentPluginScopes(scope: AgentPluginScope) {
    return scope.organizationId
        ? [agentPluginScopeWhere(scope), agentPluginScopeWhere({ ...scope, organizationId: null })]
        : [agentPluginScopeWhere(scope)]
}
