import type { PluginMarketplaceItem, PluginTargetAppMeta } from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'

export function marketplaceIconDescriptor(item: Pick<PluginMarketplaceItem, 'icon'>) {
	const icon = item.icon
	if (icon?.type !== 'image' || !/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/i.test(icon.value)) return null
	return {
		hash: createHash('sha256').update(icon.value).digest('hex'),
		type: icon.value.slice(5, icon.value.indexOf(';')),
		base64: icon.value.slice(icon.value.indexOf(',') + 1)
	}
}

export function marketplaceIconAsset(item: Pick<PluginMarketplaceItem, 'icon'>, expectedHash?: string) {
	const descriptor = marketplaceIconDescriptor(item)
	if (!descriptor || (expectedHash && descriptor.hash !== expectedHash)) return null
	return { hash: descriptor.hash, type: descriptor.type, data: Buffer.from(descriptor.base64, 'base64') }
}

/** List cards need classification and content identities; full actions and media are loaded on demand. */
export function toMarketplaceSummary(item: PluginMarketplaceItem): PluginMarketplaceItem {
	const targetAppMeta: PluginTargetAppMeta = {}
	for (const [app, metadata] of Object.entries(item.targetAppMeta ?? {})) {
		if (metadata) {
			targetAppMeta[app] = {
				types: metadata.types,
				marketplace: {
					category: metadata.marketplace?.category,
					subcategory: metadata.marketplace?.subcategory,
					featured: metadata.marketplace?.featured
				}
			}
		}
	}
	const asset = marketplaceIconDescriptor(item)
	return {
		name: item.name,
		packageName: item.packageName,
		displayName: item.displayName,
		description: item.description,
		version: item.version,
		artifactNamespace: item.artifactNamespace,
		level: item.level,
		deprecated: item.deprecated,
		deprecationMessage: item.deprecationMessage,
		category: item.category,
		icon: asset ? null : item.icon,
		iconAsset: asset?.hash,
		author: item.author,
		source: item.source,
		keywords: item.keywords,
		downloads: item.downloads,
		sourceId: item.sourceId,
		sourceName: item.sourceName,
		sourceNameI18nKey: item.sourceNameI18nKey,
		installed: item.installed,
		contributions: item.contributions?.map(({ type, name }) => ({ type, name })),
		operationSummary: item.operationSummary,
		targetApps: item.targetApps,
		targetAppMeta,
		section: item.section,
		summary: true
	}
}
