// Installation ownership is independent of plugin deployment and the acting user.
// Preserve legacy organization keys; personal keys always include organization and owner.
import { getPluginApplicationScopes, PluginTemplateApplicationSummary, AIPermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'
import { serviceApplicationScopeAllows } from '../../shared/service-operation'

export function applicationInitializationAccess(
    application: Pick<PluginTemplateApplicationSummary, 'scope'> &
        Partial<Pick<PluginTemplateApplicationSummary, 'config'>>
) {
    if (
        !['organization', 'personal'].includes(application.scope) ||
        (application.config && !getPluginApplicationScopes(application.config.scope).includes(application.scope))
    )
        return 'unsupported' as const
    if (!RequestContext.getOrganizationId()) return 'organization_required' as const
    if (!serviceApplicationScopeAllows(application)) return 'role_required' as const
    if (RequestContext.currentApiPrincipal()) return 'role_required' as const
    return RequestContext.hasPermission(AIPermissionsEnum.APPLICATION_INSTALL)
        ? ('allowed' as const)
        : ('role_required' as const)
}

export function applicationInstallationIdentity(
    application: Pick<PluginTemplateApplicationSummary, 'pluginName' | 'appName' | 'scope'>
) {
    if (!serviceApplicationScopeAllows(application))
        throw new ForbiddenException(t('server-ai:Error.ApplicationOrganizationAccessDenied'))
    const tenantId = RequestContext.currentTenantId(),
        organizationId = RequestContext.getOrganizationId()
    const userId = RequestContext.currentUserId()
    if (!tenantId || !organizationId || (application.scope === 'personal' && !userId))
        throw new BadRequestException('organization_scope_required')
    if (application.scope !== 'organization' && application.scope !== 'personal')
        throw new BadRequestException('scope_not_supported')
    return {
        tenantId,
        organizationId,
        pluginName: application.pluginName,
        appName: application.appName,
        scopeKey: application.scope === 'personal' ? `personal:${organizationId}:${userId}` : organizationId,
        ...(application.scope === 'personal' ? { ownerUserId: userId, declaredScope: 'personal' as const } : {})
    }
}
