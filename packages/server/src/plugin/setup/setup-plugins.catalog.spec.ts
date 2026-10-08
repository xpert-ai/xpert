import { SetupPluginsCatalog } from './setup-plugins.catalog'
import { PluginMarketplaceService } from '../marketplace/plugin-marketplace.service'
import type { PluginMarketplaceItem } from '@xpert-ai/contracts'

jest.mock('../marketplace/plugin-marketplace.service', () => ({ PluginMarketplaceService: class {} }))

describe('SetupPluginsCatalog', () => {
	const marketplace = { listMarketplace: jest.fn() }
	const service = new SetupPluginsCatalog(marketplace as unknown as PluginMarketplaceService)
	let items: PluginMarketplaceItem[]
	beforeEach(() => {
		jest.clearAllMocks()
		items = Array.from({ length: 27 }, (_, index) => ({
			name: `plugin-${String(index).padStart(2, '0')}`,
			displayName: { en_US: `Plugin ${index}`, zh_Hans: `模型 ${index}` },
			description: 'Helpful description',
			icon: { type: 'emoji', value: '📦' },
			level: index % 2 ? 'organization' : 'system',
			version: '1.2.3',
			category: index % 2 ? 'tools' : 'model',
			targetAppMeta: { xpert: { marketplace: { category: index % 2 ? 'productivity' : 'developer-tools' } } },
			source: { type: 'npm' },
			installed: index === 0
		}))
		marketplace.listMarketplace.mockImplementation(async () => ({ items, total: items.length, errors: [] }))
	})

	it('paginates the complete catalog with rich metadata and all-page selection identities', async () => {
		const first = await service.list({ page: 1, pageSize: 12 }, 'org')
		const second = await service.list({ page: 2, pageSize: 12 }, 'org')
		const third = await service.list({ page: 3, pageSize: 12 }, 'org')
		expect(first.total).toBe(27)
		expect(first.items).toHaveLength(12)
		expect(first.selectableNames).toHaveLength(26)
		expect(first.items[0]).toMatchObject({
			title: items[0].displayName,
			icon: items[0].icon,
			description: items[0].description,
			level: 'system',
			version: '1.2.3',
			installed: true
		})
		expect(new Set([...first.items, ...second.items, ...third.items].map((item) => item.packageName)).size).toBe(27)
		expect(third.items).toHaveLength(3)
		expect(marketplace.listMarketplace).toHaveBeenCalledWith({ targetApp: 'xpert' })
	})

	it('filters multilingual text and declared type/business/level before paginating', async () => {
		const result = await service.list(
			{ search: '模型', type: 'model', businessCategory: 'developer-tools', level: 'system', pageSize: 5 },
			'org'
		)
		expect(result.total).toBe(14)
		expect(result.items).toHaveLength(5)
		expect(result.selectableNames).toHaveLength(13)
		expect(result.facets.types).toContainEqual({ value: 'tools', count: 13 })
	})

	it('groups before pagination and clamps a page when filtered results shrink', async () => {
		const result = await service.list({ groupBy: 'type', type: 'tools', page: 20, pageSize: 12 }, 'org')
		expect(result.page).toBe(2)
		expect(result.items).toHaveLength(1)
		expect(result.items[0].type).toBe('tools')
	})

	it('keeps unavailable sources visible, excludes them from select-all and revalidates installs', async () => {
		items[1].source = { type: 'website', url: 'https://example.org' }
		const result = await service.list({}, null)
		expect(result.items.find((item) => item.packageName === items[1].name)?.unavailableReason).toBe(
			'unsupported-source'
		)
		expect(result.selectableNames).not.toContain(items[1].name)
		expect(result.selectableNames).not.toContain(items[3].name)
		await expect(service.resolve([items[1].name], 'org')).rejects.toThrow()
		await expect(service.resolve(['arbitrary-package'], 'org')).rejects.toThrow()
	})

	it('deduplicates selections, pins declared versions and retains source failures', async () => {
		const choices = await service.resolve([items[2].name, items[2].name, items[3].name], 'org')
		expect(choices).toHaveLength(2)
		expect(choices[1]).toMatchObject({ level: 'organization', version: '1.2.3' })
		marketplace.listMarketplace.mockResolvedValue({
			items: [],
			errors: [{ sourceId: 'broken', sourceName: 'Registry', message: 'timeout' }]
		})
		expect((await service.list({}, 'org')).errors).toHaveLength(1)
	})
})
