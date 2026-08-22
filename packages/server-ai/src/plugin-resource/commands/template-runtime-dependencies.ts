import { PLUGIN_COMPONENT_TYPE, XpertTemplatePluginDependencies } from '@xpert-ai/contracts'
import { normalizePluginName } from '@xpert-ai/server-core'
import {
    PluginResourceInstallComponent,
    PluginResourceInstallerService,
    RuntimeComponent
} from '../plugin-resource-installer.service'

/**
 * Resolves the portable resource selectors stored on a template to the loaded
 * plugin runtime components that can be attached to an Xpert draft.
 */
export async function resolveTemplateRuntimeDependencyComponents(
    installer: PluginResourceInstallerService,
    defaultPluginName: string | undefined,
    dependencies?: XpertTemplatePluginDependencies
): Promise<RuntimeComponent[]> {
    const pluginName = normalizePluginName(defaultPluginName ?? '')
    if (!pluginName) {
        return []
    }

    const components: PluginResourceInstallComponent[] = []
    for (const item of dependencies?.skills ?? []) {
        components.push({
            pluginName: normalizePluginName(item.pluginName ?? pluginName),
            componentType: PLUGIN_COMPONENT_TYPE.SKILL,
            componentKey: item.componentKey,
            targetAgentKey: item.targetAgentKey
        })
    }
    for (const item of dependencies?.mcpServers ?? []) {
        components.push({
            pluginName: normalizePluginName(item.pluginName ?? pluginName),
            componentType: PLUGIN_COMPONENT_TYPE.MCP_SERVER,
            componentKey: item.componentKey,
            targetAgentKey: item.targetAgentKey,
            policyOverrides: item.policyOverrides
        })
    }
    for (const item of dependencies?.hooks ?? []) {
        components.push({
            pluginName: normalizePluginName(item.pluginName ?? pluginName),
            componentType: PLUGIN_COMPONENT_TYPE.HOOK,
            componentKey: item.componentKey,
            targetAgentKey: item.targetAgentKey,
            events: item.events
        })
    }
    for (const item of dependencies?.apps ?? []) {
        components.push({
            pluginName: normalizePluginName(item.pluginName ?? pluginName),
            componentType: PLUGIN_COMPONENT_TYPE.APP,
            componentKey: item.componentKey,
            auth: item.auth
        })
    }

    // Explicit resource selectors are authoritative. Plugin-wide expansion is
    // only the compatibility path for templates that declare a plugin alone.
    if (!components.length) {
        return dependencies?.plugins?.includes(pluginName)
            ? await installer.resolveRuntimeComponents(pluginName, undefined)
            : []
    }

    // Resolve each owning plugin independently so cross-plugin dependencies
    // retain the correct portable namespace and installation root.
    const groups = await Promise.all(
        Array.from(new Set(components.map((item) => item.pluginName ?? pluginName))).map((name) =>
            installer.resolveRuntimeComponents(
                name,
                components.filter((item) => item.pluginName === name)
            )
        )
    )
    return groups.flat()
}
