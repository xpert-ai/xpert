import { BadRequestException, HttpException } from '@nestjs/common'
import { PluginMarketplaceDetailErrorCode } from '@xpert-ai/contracts'
import i18next from 'i18next'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { EntityManager, Repository } from 'typeorm'
import { PluginInstanceService } from '../plugin-instance.service'
import type { LoadedPluginRecord } from '../types'
import { PluginMarketplaceService } from './plugin-marketplace.service'
import { PluginMarketplaceSource } from './plugin-marketplace-source.entity'
import { PluginMarketplaceRegistryItem } from './plugin-marketplace-registry-item.entity'
import type { MarketplaceRegistryPlugin } from './plugin-marketplace.types'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: '__global__',
	SYSTEM_GLOBAL_SCOPE: 'system:global',
	derivePluginArtifactNamespace: jest.fn((packageName: string) =>
		packageName
			.trim()
			.replace(/^@[^/]+\//, '')
			.replace(/^plugin[-_]/, '')
			.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
			.replace(/[^A-Za-z0-9]+/g, '_')
			.replace(/_+/g, '_')
			.replace(/^_+|_+$/g, '')
			.toLowerCase()
	),
	resolveTenantGlobalScopeKey: jest.fn((tenantId?: string | null) =>
		tenantId && tenantId !== 'default-tenant' ? `tenant:${tenantId}:global` : '__global__'
	),
	RequestContext: {
		getOrganizationId: jest.fn(() => 'org-1'),
		getScope: jest.fn(() => ({
			tenantId: 'tenant-1',
			organizationId: 'org-1'
		})),
		currentTenantId: jest.fn(() => 'tenant-1'),
		currentUserId: jest.fn(() => 'user-1'),
		hasRole: jest.fn(() => false)
	}
}))

jest.mock('../plugin-instance.service', () => ({
	PluginInstanceService: class PluginInstanceService {}
}))

jest.mock('./plugin-marketplace-registry-item.entity', () => ({
	PLUGIN_MARKETPLACE_REGISTRY_SECTIONS: ['marketplace', 'official', 'partner', 'community'],
	PluginMarketplaceRegistryItem: class PluginMarketplaceRegistryItem {}
}))

jest.mock('./plugin-marketplace-source.entity', () => ({
	PLUGIN_MARKETPLACE_SOURCE_TYPES: ['url', 'github', 'git'],
	PluginMarketplaceSource: class PluginMarketplaceSource {}
}))

const packageName = '@xpert-ai/plugin-server-inspection'
const query = { sourceId: 'source-1', targetApp: 'xpert', locale: 'en' }

function createService(plugins: MarketplaceRegistryPlugin[] = [], loaded: LoadedPluginRecord[] = []) {
	const sources = new Repository(PluginMarketplaceSource, {} as EntityManager)
	const registry = new Repository(PluginMarketplaceRegistryItem, {} as EntityManager)
	const source = Object.assign(new PluginMarketplaceSource(), {
		id: 'source-1',
		name: 'Test source',
		type: 'url',
		url: 'https://example.test/index.json',
		enabled: true,
		lastIndexedAt: new Date(),
		lastCatalog: { updatedAt: null, total: plugins.length, plugins }
	})
	jest.spyOn(sources, 'findOne').mockResolvedValue(source)
	jest.spyOn(registry, 'find').mockResolvedValue([])
	const instances = { findVisibleInOrganization: jest.fn().mockResolvedValue([]) } as unknown as PluginInstanceService
	const service = new PluginMarketplaceService(sources, registry, loaded, instances)
	jest.spyOn(service['metadata'].logger, 'warn').mockImplementation(() => undefined)
	return { service, source, sources }
}

async function detailError(service: PluginMarketplaceService, name = packageName) {
	try {
		await service.getMarketplacePluginDetail(name, query)
	} catch (error) {
		if (error instanceof HttpException) return error
		throw error
	}
	throw new Error('Expected detail lookup to fail')
}

beforeAll(async () => {
	await i18next.init({
		lng: 'en',
		fallbackLng: 'en',
		ns: ['server-ai'],
		resources: Object.fromEntries(
			['en', 'zh-Hans'].map((language) => [
				language,
				{
					'server-ai': JSON.parse(
						readFileSync(resolve(__dirname, '../../../../server-ai/src/i18n', `${language}.json`), 'utf8')
					)
				}
			])
		)
	})
})

afterEach(async () => {
	jest.restoreAllMocks()
	await i18next.changeLanguage('en')
})

describe('marketplace detail lookup failures', () => {
	it.each([packageName, '@example/missing-package'])(
		'uses the same neutral response for inaccessible or absent %s',
		async (name) => {
			const { service } = createService()
			const error = await detailError(service, name)
			expect(error.getStatus()).toBe(404)
			expect(error.getResponse()).toEqual({
				code: PluginMarketplaceDetailErrorCode.Unavailable,
				message: expect.stringContaining('could not be found or accessed')
			})
			expect(error.message).toContain('contact your administrator')
			expect(error.message).not.toContain('was not found')
		}
	)

	it.each([new Error('timeout'), new BadRequestException('Failed to fetch marketplace index (403)')])(
		'reports a failed source lookup separately without claiming the user or package is denied',
		async (failure) => {
			const { service } = createService()
			jest.spyOn(service['catalogs'], 'load').mockRejectedValue(failure)
			const error = await detailError(service)
			expect(error.getStatus()).toBe(503)
			expect(error.getResponse()).toEqual({
				code: PluginMarketplaceDetailErrorCode.LookupFailed,
				message: expect.stringContaining('marketplace source could not be loaded')
			})
			expect(error.message).not.toContain(failure.message)
		}
	)

	it('localizes backend unavailable and source failure responses', async () => {
		await i18next.changeLanguage('zh-Hans')
		const { service } = createService()
		expect((await detailError(service)).message).toContain('未找到此软件包或无法访问')
		jest.spyOn(service['catalogs'], 'load').mockRejectedValue(new Error('timeout'))
		expect((await detailError(service)).message).toContain('无法加载插件市场来源')
	})

	it('does not expose a disabled source or a package for another target app', async () => {
		const { service, source } = createService([{ name: packageName, targetApps: ['data-xpert'] }])
		expect((await detailError(service)).getStatus()).toBe(404)
		source.enabled = false
		const load = jest.spyOn(service['catalogs'], 'load')
		expect((await detailError(service)).getStatus()).toBe(404)
		expect(load).not.toHaveBeenCalled()
	})

	it('loads a public plugin and its README successfully', async () => {
		const { service } = createService([
			{
				name: '@example/public-plugin',
				targetApps: ['xpert'],
				targetAppMeta: { xpert: { marketplace: { readme: '# Public plugin' } } }
			}
		])
		jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 404 }))
		const detail = await service.getMarketplacePluginDetail('@example/public-plugin', query)
		expect(detail.name).toBe('@example/public-plugin')
		expect(detail.readme).toMatchObject({ source: 'marketplace-metadata', content: '# Public plugin' })
	})

	it('keeps catalog details available when a non-public npm package cannot supply a README', async () => {
		const { service } = createService([
			{ name: packageName, targetApps: ['xpert'], description: 'Inspection details' }
		])
		const fetch = jest
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response('{"error":"Not found"}', { status: 404 }))
		const detail = await service.getMarketplacePluginDetail(packageName, query)
		expect(fetch).toHaveBeenCalledWith(
			`https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
			expect.anything()
		)
		expect(detail.readme).toMatchObject({ source: 'description', content: 'Inspection details' })
	})

	it('uses a visible loaded plugin even when the marketplace source fails', async () => {
		const { service } = createService(
			[],
			[
				{
					name: packageName,
					packageName,
					organizationId: 'org-1',
					source: 'code',
					ctx: {},
					instance: { meta: { name: packageName, targetApps: ['xpert'], description: 'Loaded inspection' } }
				}
			]
		)
		jest.spyOn(service['catalogs'], 'load').mockRejectedValue(new Error('timeout'))
		const detail = await service.getMarketplacePluginDetail(packageName, query)
		expect(detail).toMatchObject({ name: packageName, installed: true })
		expect(detail.readme.content).toBe('Loaded inspection')
	})

	it('returns a matching plugin from a later source after an earlier source fails', async () => {
		const { service, source, sources } = createService([
			{ name: packageName, targetApps: ['xpert'], description: 'Available from another source' }
		])
		const builtin = Object.assign(new PluginMarketplaceSource(), {
			id: 'builtin-cache',
			name: '__xpert_builtin_plugin_marketplace_source__',
			type: 'url',
			url: 'https://xpert-ai.github.io/xpert-plugin-registry/plugins/index.json'
		})
		jest.spyOn(sources, 'find').mockResolvedValue([builtin, source])
		jest.spyOn(service['catalogs'], 'load')
			.mockRejectedValueOnce(new Error('timeout'))
			.mockResolvedValueOnce(source.lastCatalog)
		jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }))
		const detail = await service.getMarketplacePluginDetail(packageName, { targetApp: 'xpert' })
		expect(detail.readme.content).toBe('Available from another source')
	})
})
