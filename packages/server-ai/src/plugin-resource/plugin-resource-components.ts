import { PLUGIN_COMPONENT_TYPE, PluginComponentType } from '@xpert-ai/contracts'
import type { IPluginResourceComponentState } from '@xpert-ai/contracts'
import {
    collectPluginBundleComponents,
    LoadedPluginRecord,
    normalizePluginName,
    readPluginBundleManifest,
    resolveLoadedPluginBundleRoot
} from '@xpert-ai/server-core'
import { NotFoundException } from '@nestjs/common'
import {
    GLOBAL_ORGANIZATION_SCOPE,
    RequestContext,
    SYSTEM_GLOBAL_SCOPE,
    resolveTenantGlobalScopeKey
} from '@xpert-ai/plugin-sdk'

export type PluginResourceInstallTarget = 'organization' | 'workspace' | 'xpert'

export function isPluginResourceInstallableForTarget(
    componentType: PluginComponentType,
    target?: PluginResourceInstallTarget
) {
    if (!target) {
        return componentType !== PLUGIN_COMPONENT_TYPE.ASSET
    }
    if (target === 'organization') {
        return componentType === PLUGIN_COMPONENT_TYPE.TOOLSET
    }
    if (target === 'workspace') {
        return (
            componentType === PLUGIN_COMPONENT_TYPE.SKILL ||
            componentType === PLUGIN_COMPONENT_TYPE.MCP_SERVER ||
            componentType === PLUGIN_COMPONENT_TYPE.APP
        )
    }
    return componentType === PLUGIN_COMPONENT_TYPE.HOOK
}

export function readPluginResourceComponents(pluginName: string, rootDir: string) {
    const manifestResult = readPluginBundleManifest(rootDir)
    const components = manifestResult ? collectPluginBundleComponents(rootDir, manifestResult.manifest) : []
    if (!components.length) {
        throw new NotFoundException(`Plugin '${pluginName}' has no installable components`)
    }
    return components
}

export function resolveLoadedPluginResourceRoot(pluginName: string, loadedPlugins: LoadedPluginRecord[]) {
    const normalizedPluginName = normalizePluginName(pluginName)
    const organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
    const tenantId = RequestContext.getScope()?.tenantId ?? RequestContext.currentTenantId()
    const organizationScopeKey =
        organizationId === GLOBAL_ORGANIZATION_SCOPE ? resolveTenantGlobalScopeKey(tenantId) : organizationId
    const globalScopeKey = resolveTenantGlobalScopeKey(tenantId)
    const candidates = loadedPlugins.filter((item) => {
        const names = [item.name, item.packageName].filter((value): value is string => !!value)
        return names.some((name) => normalizePluginName(name) === normalizedPluginName)
    })
    const record =
        candidates.find((item) => (item.scopeKey ?? item.organizationId) === organizationScopeKey) ??
        (organizationId !== GLOBAL_ORGANIZATION_SCOPE
            ? candidates.find((item) => (item.scopeKey ?? item.organizationId) === globalScopeKey)
            : null) ??
        candidates.find((item) => (item.scopeKey ?? item.organizationId) === SYSTEM_GLOBAL_SCOPE)
    if (!record) {
        throw new NotFoundException(`Loaded plugin '${normalizedPluginName}' was not found`)
    }
    const root = resolveLoadedPluginBundleRoot(record)
    if (!root) {
        throw new NotFoundException(
            `Loaded plugin '${normalizedPluginName}' does not expose a portable resource manifest`
        )
    }
    return root
}

export function pluginSkillSharedId(pluginName: string, componentKey: string) {
    return `plugin:${pluginName}:skill:${componentKey}`
}

export function pluginResourceComponentStateKey(
    component: Pick<IPluginResourceComponentState, 'componentType' | 'componentKey'>
) {
    return `${component.componentType}:${component.componentKey}`
}
