import { PluginTemplateApplicationSummary } from '@xpert-ai/contracts'
import { resolvePluginScreenshot } from './plugin-application-assets'
import type { ResolvedApplication } from './loaded-applications'
import { catalogThumbnail } from '../../shared/catalog-thumbnail'

export function applicationCard(app: PluginTemplateApplicationSummary) {
    const { id, pluginName, appName, displayName, description, scope, icon } = app
    const { tagline, developer, screenshots } = app.config.presentation ?? {}
    return {
        hasCardImages: Boolean(screenshots?.length || (icon && icon.type !== 'emoji')),
        application: {
            id,
            pluginName,
            appName,
            displayName,
            description,
            scope,
            icon: icon?.type === 'emoji' ? icon : undefined,
            config: { scope: app.config.scope, presentation: { tagline, developer } }
        }
    }
}

export async function applicationCardImages({ application: app, plugin }: ResolvedApplication) {
    // Keep original slides in detail. Stop after the first usable list cover.
    let cover: string | null = null
    for (const source of app.config.presentation?.screenshots ?? []) {
        cover = await catalogThumbnail(resolvePluginScreenshot(plugin, source), 640)
        if (cover) break
    }
    const raw = app.icon
    const iconSource =
        raw?.type === 'svg'
            ? 'data:image/svg+xml;base64,' + Buffer.from(raw.value).toString('base64')
            : raw?.type === 'image'
              ? raw.value
              : null
    return { cover, icon: iconSource ? await catalogThumbnail(iconSource, 96) : null }
}
