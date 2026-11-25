import {
    getPluginApplicationScopes,
    PluginApplicationCatalogMetadata,
    PluginApplicationScope,
    PluginTargetAppMarketplaceMetadata,
    PluginTemplateApplicationSummary
} from '@xpert-ai/contracts'
import { LoadedPluginRecord, normalizePluginName } from '@xpert-ai/server-core'
import { resolvePluginApplicationConfigAssets } from './plugin-application-assets'

/** Trusted App definition paired with the exact plugin template/version to install. */
export type ResolvedApplication = {
    plugin: LoadedPluginRecord
    application: PluginTemplateApplicationSummary
    marketplace: PluginApplicationCatalogMetadata
    pluginVersion: string | null
    templateId: string
    templateVersion: string | null
}

/**
 * Materializes application contributions from loaded plugin metadata.
 * Duplicate declarations within one plugin are collapsed by stable App ID;
 * no marketplace response or localized text participates in resolution.
 */
export function loadedApplications(
    plugins: LoadedPluginRecord[],
    installationScope?: PluginApplicationScope,
    resolveImages = true,
    target?: { pluginName: string; appName: string }
): ResolvedApplication[] {
    const applications = new Map<string, ResolvedApplication>()
    for (const plugin of plugins) {
        const meta = plugin.instance?.meta
        const pluginName = normalizePluginName(plugin.packageName ?? plugin.name ?? meta?.name ?? '')
        if (!meta || !pluginName || (target && pluginName !== target.pluginName)) continue
        const metadataEntries = Object.values(meta.targetAppMeta ?? {}) as Array<{
            marketplace?: PluginTargetAppMarketplaceMetadata
        }>
        for (const metadata of metadataEntries) {
            const marketplace = metadata?.marketplace
            const contributions = Array.isArray(marketplace?.contents) ? marketplace.contents : []
            for (const app of contributions) {
                if (app.type !== 'app' || !app.name?.trim() || !app.appConfig) continue
                const scopes = getPluginApplicationScopes(app.appConfig.scope)
                if (!scopes.length) continue
                const id = `${pluginName}:${app.name}`
                if (applications.has(id) || (target && app.name !== target.appName)) continue
                const declaredConfig = resolveImages
                    ? resolvePluginApplicationConfigAssets(plugin, app.appConfig, marketplace)
                    : {
                          ...app.appConfig,
                          presentation: {
                              ...app.appConfig.presentation,
                              screenshots: app.appConfig.presentation?.screenshots ?? marketplace.screenshots
                          }
                      }
                // Keep legacy plugin declarations compatible without granting organization-wide authoring.
                const appConfig = {
                    ...declaredConfig,
                    workspace: { ...declaredConfig.workspace, sharing: 'private' as const }
                }
                applications.set(id, {
                    plugin,
                    application: {
                        id,
                        pluginName,
                        appName: app.name,
                        displayName: app.displayName ?? app.name,
                        description: app.description,
                        icon: app.icon ?? meta.icon,
                        color: app.color,
                        scope: installationScope ?? scopes[0],
                        assistantTemplateKey: appConfig.assistantTemplateKey,
                        config: appConfig
                    },
                    marketplace: {
                        category: marketplace?.category,
                        subcategory: marketplace?.subcategory,
                        featured: marketplace?.featured,
                        tags: [...(app.tags ?? [])],
                        updatedAt: marketplace?.updatedAt
                    },
                    pluginVersion: meta.version ?? null,
                    templateId: `${pluginName}:${app.appConfig.assistantTemplateKey}`,
                    templateVersion: meta.version ?? null
                })
            }
        }
    }
    return [...applications.values()]
}
