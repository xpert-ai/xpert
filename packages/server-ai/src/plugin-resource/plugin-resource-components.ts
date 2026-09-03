import { PLUGIN_COMPONENT_TYPE, PluginComponentType } from '@xpert-ai/contracts'
import type { IPluginResourceComponentState } from '@xpert-ai/contracts'
import {
    collectPluginBundleComponents,
    LoadedPluginRecord,
    normalizePluginName,
    PluginBundleComponentRegistration,
    readPluginBundleManifest,
    resolveLoadedPluginBundleRoot
} from '@xpert-ai/server-core'
import { NotFoundException } from '@nestjs/common'
import {
    GLOBAL_ORGANIZATION_SCOPE,
    RequestContext,
    SYSTEM_GLOBAL_SCOPE,
    XpertToolProviderRegistry,
    describeXpertToolProvider,
    resolveTenantGlobalScopeKey
} from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import { zodToJsonSchema } from 'zod-to-json-schema'

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

export function listRuntimeToolProviderComponents(
    pluginName: string,
    registry: XpertToolProviderRegistry,
    organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
) {
    const normalizedPluginName = normalizePluginName(pluginName)
    return registry
        .listRegistrations(organizationId)
        .filter(
            ({ source }) => source.kind === 'plugin' && normalizePluginName(source.pluginName) === normalizedPluginName
        )
        .map(({ strategy, source }) => ({
            component: runtimeToolProviderComponent(strategy),
            source,
            pluginVersion: source.kind === 'plugin' ? source.pluginVersion : undefined
        }))
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

function runtimeToolProviderComponent(provider: object): PluginBundleComponentRegistration {
    const descriptor = describeXpertToolProvider(provider)
    const options = descriptor.options
    const tools = descriptor.tools.map((tool) => ({
        name: tool.options.name,
        title: tool.options.title ?? null,
        description: tool.options.description,
        middleware: tool.middlewareProvider ?? null,
        mcp: tool.options.mcp
            ? {
                  behavior: tool.options.mcp.behavior,
                  requiredContext: [...tool.options.mcp.requiredContext],
                  visibility: [...(tool.options.mcp.visibility ?? ['model'])],
                  inputSchema: JSON.parse(JSON.stringify(zodToJsonSchema(tool.options.inputSchema))),
                  outputSchema: tool.options.outputSchema
                      ? JSON.parse(JSON.stringify(zodToJsonSchema(tool.options.outputSchema)))
                      : null
              }
            : null
    }))
    const config = {
        provider: options.provider,
        name: options.name,
        description: options.description ?? null,
        instructions: options.instructions ?? null,
        runtimeDiscovered: true,
        nativeMcp: true,
        toolCount: tools.filter((tool) => !!tool.mcp).length
    }
    const metadata = {
        runtimeDiscovered: true,
        nativeMcp: true,
        toolNames: tools.filter((tool) => !!tool.mcp).map((tool) => tool.name)
    }
    return {
        componentType: PLUGIN_COMPONENT_TYPE.TOOLSET,
        componentKey: options.componentKey,
        config,
        metadata,
        definitionHash: createHash('sha256').update(stableJson({ config, metadata, tools })).digest('hex')
    }
}

function stableJson(value: unknown): string {
    if (value === undefined) return 'null'
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
}
