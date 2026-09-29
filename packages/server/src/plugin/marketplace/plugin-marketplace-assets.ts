import { PluginMarketplaceItem } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { PluginMarketplaceSharedCache } from './plugin-marketplace-shared-cache'
import { marketplaceIconAsset, marketplaceIconDescriptor, toMarketplaceSummary } from './plugin-marketplace-summary'

/** Assets are immutable by hash but remain scoped and require a fresh catalog visibility check. */
export class PluginMarketplaceAssets {
	constructor(private readonly shared?: PluginMarketplaceSharedCache) {}
	private identity(item: Pick<PluginMarketplaceItem, 'name' | 'sourceId'>, hash: string, targetApp?: string) {
		return JSON.stringify([
			RequestContext.getScope()?.tenantId ?? RequestContext.currentTenantId(),
			RequestContext.getOrganizationId() ?? null,
			item.sourceId ?? null,
			item.name,
			targetApp ?? null,
			hash
		])
	}

	async summaries(items: PluginMarketplaceItem[], targetApp?: string) {
		return Promise.all(
			items.map(async (item) => {
				const summary = toMarketplaceSummary(item)
				if (this.shared && summary.iconAsset && item.icon?.type === 'image') {
					try {
						await this.shared.put(
							'icons',
							this.identity(item, summary.iconAsset, targetApp),
							item.icon.value,
							86_400_000
						)
					} catch {
						// Keep cards usable if shared publication fails; do not advertise an unavailable hash.
						summary.icon = item.icon
						delete summary.iconAsset
					}
				}
				return summary
			})
		)
	}

	async get(item: PluginMarketplaceItem, hash: string, targetApp?: string) {
		if (this.shared) {
			try {
				const value = await this.shared.get(this.shared.key('icons', this.identity(item, hash, targetApp)))
				if (value) {
					const stored = { icon: { type: 'image' as const, value } }
					if (marketplaceIconDescriptor(stored)?.hash === hash) return marketplaceIconAsset(stored, hash)
				}
			} catch {
				/* The current instance may still have the identical icon. */
			}
		}
		return marketplaceIconAsset(item, hash)
	}
}
