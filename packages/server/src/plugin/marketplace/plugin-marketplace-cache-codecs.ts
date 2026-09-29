import { PLUGIN_LEVEL, PluginLevel, PluginMarketplaceReadme } from '@xpert-ai/contracts'

export function decodeNpmMetadata(value: unknown): { level?: PluginLevel } | null | undefined {
	if (value === null) return null
	if (!value || typeof value !== 'object') return undefined
	if (!('level' in value) || value.level === undefined) return {}
	if (
		value.level === PLUGIN_LEVEL.SYSTEM ||
		value.level === PLUGIN_LEVEL.TENANT ||
		value.level === PLUGIN_LEVEL.ORGANIZATION
	)
		return { level: value.level }
	return undefined
}
export function decodeNpmReadme(value: unknown): PluginMarketplaceReadme | null | undefined {
	if (value === null) return null
	if (
		!value ||
		typeof value !== 'object' ||
		!('locale' in value) ||
		typeof value.locale !== 'string' ||
		!('content' in value) ||
		typeof value.content !== 'string' ||
		!('source' in value) ||
		value.source !== 'npm-package'
	)
		return undefined
	return {
		locale: value.locale,
		content: value.content,
		source: value.source,
		requestedLocale:
			'requestedLocale' in value && typeof value.requestedLocale === 'string' ? value.requestedLocale : null,
		fileName: 'fileName' in value && typeof value.fileName === 'string' ? value.fileName : null
	}
}
export function decodeDownloadCount(value: unknown): number | null | undefined {
	return value === null ? null : typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}
