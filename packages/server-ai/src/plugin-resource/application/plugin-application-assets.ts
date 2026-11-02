import { PluginMarketplaceAppConfig, PluginTargetAppMarketplaceMetadata } from '@xpert-ai/contracts'
import { LoadedPluginRecord, readPluginBundleManifest, resolveLoadedPluginBundleRoot } from '@xpert-ai/server-core'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, isAbsolute, relative, resolve } from 'node:path'

const MAX_INLINE_SCREENSHOT_BYTES = 5 * 1024 * 1024
const MAX_CACHED_SCREENSHOTS = 128
const SCREENSHOT_MEDIA_TYPES = new Map([
    ['.gif', 'image/gif'],
    ['.jpeg', 'image/jpeg'],
    ['.jpg', 'image/jpeg'],
    ['.png', 'image/png'],
    ['.svg', 'image/svg+xml'],
    ['.webp', 'image/webp']
])

type CachedScreenshot = {
    mtimeMs: number
    size: number
    dataUrl: string
}

const screenshotCache = new Map<string, CachedScreenshot>()

/**
 * App screenshots override marketplace screenshots; an explicit [] hides them.
 * Resolve both sources through the same bundle asset boundary.
 *
 * Only files listed in the portable plugin manifest are read. Remote URLs,
 * root-relative host URLs and existing data URLs pass through unchanged.
 */
export function resolvePluginApplicationConfigAssets(
    plugin: LoadedPluginRecord,
    config: PluginMarketplaceAppConfig,
    marketplace?: Pick<PluginTargetAppMarketplaceMetadata, 'screenshots'>
): PluginMarketplaceAppConfig {
    const screenshots = config.presentation?.screenshots ?? marketplace?.screenshots
    if (!screenshots) {
        return config
    }

    return {
        ...config,
        presentation: {
            ...config.presentation,
            screenshots: screenshots.map((screenshot) => resolvePluginScreenshot(plugin, screenshot))
        }
    }
}

/**
 * Resolves one screenshot without broad filesystem access. A local path is
 * eligible only when both the requested path and the manifest declaration
 * resolve to the same file inside the loaded plugin bundle root.
 */
function resolvePluginScreenshot(plugin: LoadedPluginRecord, screenshot: string): string {
    const value = screenshot?.trim()
    if (!value || /^(?:data:|https?:\/\/|\/)/i.test(value)) {
        return value
    }

    try {
        const bundleRoot = resolveLoadedPluginBundleRoot(plugin)
        if (!bundleRoot) {
            return screenshot
        }
        const rootDir = realpathSync(bundleRoot)
        const manifest = readPluginBundleManifest(rootDir)?.manifest
        const declaredScreenshots = manifest?.assets?.screenshots ?? []
        const screenshotPath = resolve(rootDir, value)
        if (
            !isPathWithinRoot(rootDir, screenshotPath) ||
            !declaredScreenshots.some((declared) => resolve(rootDir, declared) === screenshotPath)
        ) {
            return screenshot
        }

        const mimeType = SCREENSHOT_MEDIA_TYPES.get(extname(screenshotPath).toLowerCase())
        if (!mimeType) {
            return screenshot
        }
        const realScreenshotPath = realpathSync(screenshotPath)
        if (!isPathWithinRoot(rootDir, realScreenshotPath)) {
            return screenshot
        }
        const stat = statSync(realScreenshotPath)
        if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_INLINE_SCREENSHOT_BYTES) {
            return screenshot
        }

        const cached = screenshotCache.get(realScreenshotPath)
        if (cached?.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
            return cached.dataUrl
        }
        const dataUrl = `data:${mimeType};base64,${readFileSync(realScreenshotPath).toString('base64')}`
        cacheScreenshot(realScreenshotPath, { mtimeMs: stat.mtimeMs, size: stat.size, dataUrl })
        return dataUrl
    } catch {
        return screenshot
    }
}

/** Prevents absolute paths and `..` traversal from escaping the plugin bundle. */
function isPathWithinRoot(rootDir: string, targetPath: string): boolean {
    const relativePath = relative(rootDir, targetPath)
    return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

/** Keeps inline image payloads bounded across plugin refreshes in a long-lived API process. */
function cacheScreenshot(path: string, screenshot: CachedScreenshot): void {
    if (!screenshotCache.has(path) && screenshotCache.size >= MAX_CACHED_SCREENSHOTS) {
        const oldestPath = screenshotCache.keys().next().value
        if (typeof oldestPath === 'string') {
            screenshotCache.delete(oldestPath)
        }
    }
    screenshotCache.set(path, screenshot)
}
