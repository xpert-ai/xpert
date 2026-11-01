import { LoadedPluginRecord, normalizePluginName } from '@xpert-ai/server-core'
import {
    RequestContext,
    GLOBAL_ORGANIZATION_SCOPE,
    SYSTEM_GLOBAL_SCOPE,
    resolveTenantGlobalScopeKey
} from '@xpert-ai/plugin-sdk'

/**
 * Limit loaded records to the current organization, tenant and system scopes.
 * For each normalized package name, retain the last eligible loader record.
 */
export function effectiveLoadedPlugins(loadedPlugins: LoadedPluginRecord[]): LoadedPluginRecord[] {
    const organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
    const tenantId = RequestContext.getScope()?.tenantId ?? RequestContext.currentTenantId()
    const organizationScopeKey =
        organizationId === GLOBAL_ORGANIZATION_SCOPE ? resolveTenantGlobalScopeKey(tenantId) : organizationId
    const tenantScopeKey = resolveTenantGlobalScopeKey(tenantId)
    const seen = new Set<string>()

    return [...loadedPlugins]
        .filter((plugin) => {
            const scopeKey = plugin.scopeKey ?? plugin.organizationId
            return (
                scopeKey === organizationScopeKey ||
                (organizationId !== GLOBAL_ORGANIZATION_SCOPE && scopeKey === tenantScopeKey) ||
                scopeKey === SYSTEM_GLOBAL_SCOPE
            )
        })
        .reverse()
        .filter((plugin) => {
            const key = normalizePluginName(plugin.packageName ?? plugin.name ?? plugin.instance?.meta?.name ?? '')
            if (!key || seen.has(key)) {
                return false
            }
            seen.add(key)
            return true
        })
        .reverse()
}
