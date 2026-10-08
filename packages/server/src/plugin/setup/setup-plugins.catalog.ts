import { BadRequestException, Injectable } from '@nestjs/common'
import { t } from 'i18next'
import {
	PLUGIN_MARKETPLACE_CATEGORIES,
	PLUGIN_MARKETPLACE_SUBCATEGORIES,
	type PluginMarketplaceCategory,
	type SetupPluginCatalogItem,
	type SetupPluginCatalogQuery,
	type SetupPluginCatalogResponse,
	type SetupPluginChoice
} from '@xpert-ai/contracts'
import { PluginMarketplaceService } from '../marketplace/plugin-marketplace.service'

/** Use the configured marketplace sources; never maintain a second list of setup-only packages. */
@Injectable()
export class SetupPluginsCatalog {
	constructor(private readonly marketplace: PluginMarketplaceService) {}

	private async all(organizationId: string | null) {
		const response = await this.marketplace.listMarketplace({ targetApp: 'xpert' })
		const byPackage = new Map<string, SetupPluginCatalogItem>()
		for (const plugin of response.items) {
			const packageName = plugin.source?.packageName || plugin.packageName || plugin.name
			if (byPackage.has(packageName)) continue
			const metadata = plugin.targetAppMeta?.xpert?.marketplace
			const source = plugin.source?.type
			byPackage.set(packageName, {
				packageName,
				title: plugin.displayName || plugin.name,
				description: plugin.description,
				icon: plugin.icon,
				author: plugin.author,
				sourceName: plugin.sourceName,
				version: plugin.version || undefined,
				level: plugin.level,
				type:
					metadata?.subcategory || PLUGIN_MARKETPLACE_SUBCATEGORIES.find((type) => type === plugin.category),
				businessCategory: metadata?.category,
				installed: plugin.installed === true,
				deprecated: plugin.deprecated,
				deprecationMessage: plugin.deprecationMessage,
				unavailableReason:
					source && source !== 'npm' && source !== 'marketplace'
						? 'unsupported-source'
						: !organizationId && (!plugin.level || plugin.level === 'organization')
							? 'organization-required'
							: undefined
			})
		}
		return { items: [...byPackage.values()], errors: response.errors ?? [] }
	}

	async list(query: SetupPluginCatalogQuery, organizationId: string | null): Promise<SetupPluginCatalogResponse> {
		const { items, errors } = await this.all(organizationId)
		const search = query.search?.trim().toLowerCase()
		const matches = items.filter(
			(item) =>
				(!search ||
					[item.packageName, ...textValues(item.title), ...textValues(item.description)]
						.join(' ')
						.toLowerCase()
						.includes(search)) &&
				(!query.type || item.type === query.type) &&
				(!query.businessCategory || item.businessCategory === query.businessCategory) &&
				(!query.level || item.level === query.level)
		)
		const group = (item: SetupPluginCatalogItem) =>
			query.groupBy === 'type'
				? (item.type ?? '')
				: query.groupBy === 'business'
					? (item.businessCategory ?? '')
					: ''
		matches.sort((a, b) => group(a).localeCompare(group(b)) || a.packageName.localeCompare(b.packageName))
		const pageSize = query.pageSize ?? 12
		const page = Math.min(query.page ?? 1, Math.max(1, Math.ceil(matches.length / pageSize)))
		return {
			items: matches.slice((page - 1) * pageSize, page * pageSize),
			total: matches.length,
			page,
			pageSize,
			selectableNames: matches
				.filter((item) => !item.installed && !item.unavailableReason)
				.map((item) => item.packageName),
			facets: {
				types: [...new Set(items.flatMap((item) => (item.type ? [item.type] : [])))]
					.sort()
					.map((value) => ({ value, count: items.filter((item) => item.type === value).length })),
				businessCategories: PLUGIN_MARKETPLACE_CATEGORIES.map((value: PluginMarketplaceCategory) => ({
					value,
					count: items.filter((item) => item.businessCategory === value).length
				})).filter((item) => item.count > 0)
			},
			errors
		}
	}

	async resolve(names: string[], organizationId: string | null): Promise<SetupPluginChoice[]> {
		if (!names.length) return []
		const { items } = await this.all(organizationId)
		return [...new Set(names)].map((name) => {
			const item = items.find((item) => item.packageName === name)
			if (!item || (item.unavailableReason && !item.installed)) {
				throw new BadRequestException(
					t('server:Error.SetupPluginSelection', {
						defaultValue: 'The selected plugin is unavailable. Refresh the catalog and try again.'
					})
				)
			}
			return { packageName: item.packageName, title: item.title, version: item.version, level: item.level }
		})
	}
}

function textValues(value: SetupPluginCatalogItem['title'] | undefined): string[] {
	return typeof value === 'string' ? [value] : Object.values(value ?? {})
}
