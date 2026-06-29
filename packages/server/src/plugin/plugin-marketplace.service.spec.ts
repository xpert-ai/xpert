import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PluginMarketplaceService } from './plugin-marketplace.service'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: '__global__',
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

jest.mock('./plugin-instance.service', () => ({
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

describe('PluginMarketplaceService README detail', () => {
	let tempRoot: string
	let service: PluginMarketplaceService

	beforeEach(() => {
		tempRoot = mkdtempSync(join(tmpdir(), 'xpert-plugin-readme-test-'))
		mkdirSync(join(tempRoot, '.xpertai-plugin'), { recursive: true })
		writeFileSync(
			join(tempRoot, '.xpertai-plugin', 'plugin.json'),
			JSON.stringify({
				name: '@xpert-ai/plugin-canvas',
				version: '0.1.0'
			})
		)
		writeFileSync(join(tempRoot, 'README.md'), '# Canvas\n\nEnglish README')
		writeFileSync(join(tempRoot, 'README_zh-hans.md'), '# Canvas\n\n简体中文 README')

		service = new PluginMarketplaceService(
			{} as any,
			{} as any,
			[
				{
					organizationId: 'org-1',
					name: '@xpert-ai/plugin-canvas',
					packageName: '@xpert-ai/plugin-canvas',
					source: 'code',
					sourceConfig: {
						workspacePath: tempRoot
					},
					instance: {
						meta: {
							name: '@xpert-ai/plugin-canvas',
							version: '0.1.0',
							displayName: 'Canvas',
							description: 'Canvas plugin',
							category: 'middleware',
							author: 'XpertAI'
						}
					},
					ctx: {}
				}
			] as any,
			{} as any
		)
		jest.spyOn(service as any, 'findMarketplacePlugin').mockResolvedValue({
			name: '@xpert-ai/plugin-canvas',
			packageName: '@xpert-ai/plugin-canvas',
			displayName: 'Canvas',
			description: 'Canvas plugin',
			version: '0.1.0',
			installed: true
		})
	})

	afterEach(() => {
		rmSync(tempRoot, { recursive: true, force: true })
		jest.restoreAllMocks()
	})

	it('prefers localized package README files', async () => {
		const detail = await service.getMarketplacePluginDetail('@xpert-ai/plugin-canvas', {
			targetApp: 'xpert',
			locale: 'zh-Hans'
		})

		expect(detail.readme).toEqual(
			expect.objectContaining({
				locale: 'zh-hans',
				fileName: 'README_zh-hans.md',
				source: 'installed-package',
				content: expect.stringContaining('简体中文 README')
			})
		)
		expect(detail.availableReadmeLocales).toEqual(expect.arrayContaining(['en', 'zh-hans']))
	})

	it('falls back to README.md when a localized README is missing', async () => {
		const detail = await service.getMarketplacePluginDetail('@xpert-ai/plugin-canvas', {
			targetApp: 'xpert',
			locale: 'fr-FR'
		})

		expect(detail.readme).toEqual(
			expect.objectContaining({
				locale: 'en',
				fileName: 'README.md',
				source: 'installed-package',
				content: expect.stringContaining('English README')
			})
		)
	})
})
