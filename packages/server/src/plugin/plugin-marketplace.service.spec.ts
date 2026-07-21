import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { PluginMarketplaceService } from './plugin-marketplace.service'

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

const DOCUMENTS_PACKAGE = '@xpert-ai/plugin-documents'
const DOCUMENTS_VERSION = '1.2.3'
const NPM_REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(DOCUMENTS_PACKAGE)}`
const NPM_TARBALL_URL = 'https://registry.example.test/xpert-ai/plugin-documents/-/plugin-documents-1.2.3.tgz'

function createNpmPluginTarball(manifest: Record<string, unknown>, files: Record<string, string | Buffer> = {}) {
	const tempRoot = mkdtempSync(join(tmpdir(), 'xpert-plugin-npm-test-'))
	const packageRoot = join(tempRoot, 'package')
	mkdirSync(join(packageRoot, '.xpertai-plugin'), { recursive: true })
	writeFileSync(
		join(packageRoot, 'package.json'),
		JSON.stringify({
			name: DOCUMENTS_PACKAGE,
			version: DOCUMENTS_VERSION
		})
	)
	writeFileSync(join(packageRoot, '.xpertai-plugin', 'plugin.json'), JSON.stringify(manifest))
	for (const [filePath, content] of Object.entries(files)) {
		const targetPath = join(packageRoot, filePath)
		mkdirSync(dirname(targetPath), { recursive: true })
		writeFileSync(targetPath, content)
	}

	const archivePath = join(tempRoot, 'package.tgz')
	execFileSync('tar', ['-czf', archivePath, '-C', tempRoot, 'package'])

	return {
		tempRoot,
		tarballBytes: readFileSync(archivePath)
	}
}

function mockNpmFetch(tarballBytes: Buffer | null, metadataOverrides: Record<string, unknown> = {}) {
	const metadata = {
		name: DOCUMENTS_PACKAGE,
		'dist-tags': {
			latest: DOCUMENTS_VERSION
		},
		versions: {
			[DOCUMENTS_VERSION]: {
				name: DOCUMENTS_PACKAGE,
				version: DOCUMENTS_VERSION,
				dist: {
					tarball: NPM_TARBALL_URL
				},
				...metadataOverrides
			}
		}
	}

	return jest.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request) => {
		const requestUrl = String(url)
		if (requestUrl === NPM_REGISTRY_URL) {
			return {
				ok: Boolean(tarballBytes),
				status: tarballBytes ? 200 : 500,
				json: async () => metadata
			} as Response
		}
		if (requestUrl === NPM_TARBALL_URL && tarballBytes) {
			return {
				ok: true,
				status: 200,
				arrayBuffer: async () =>
					tarballBytes.buffer.slice(
						tarballBytes.byteOffset,
						tarballBytes.byteOffset + tarballBytes.byteLength
					) as ArrayBuffer
			} as Response
		}
		return {
			ok: false,
			status: 404,
			json: async () => ({}),
			arrayBuffer: async () => new ArrayBuffer(0)
		} as Response
	})
}

function createPlatformRegistryItem(overrides: Record<string, unknown> = {}) {
	return {
		id: 'registry-documents',
		packageName: DOCUMENTS_PACKAGE,
		version: DOCUMENTS_VERSION,
		displayName: 'Registry Documents',
		description: 'Registry curated description',
		category: 'productivity',
		author: 'Registry Team',
		keywords: ['registry'],
		targetApps: [],
		targetAppMeta: {},
		enabled: true,
		priority: 10,
		downloadsUpdatedAt: new Date(),
		updatedAt: new Date(),
		...overrides
	}
}

function createMarketplaceServiceWithPlatformItems(items: Array<Record<string, unknown>>) {
	const registryRepository = {
		find: jest.fn().mockResolvedValue(items)
	}
	const service = new PluginMarketplaceService({} as any, registryRepository as any, [] as any, {} as any)
	jest.spyOn(service as any, 'getSourceRecords').mockResolvedValue([])
	jest.spyOn(service as any, 'buildInstalledContext').mockResolvedValue({
		installedNames: new Set<string>(),
		loadedMetaByName: new Map()
	})
	return service
}

describe('PluginMarketplaceService localized registry metadata', () => {
	it('normalizes and preserves localized display names and descriptions', async () => {
		jest.mocked(RequestContext.hasRole).mockReturnValueOnce(true)
		const registryRepository = {
			findOne: jest.fn().mockResolvedValue(null),
			create: jest.fn((value) => ({ id: 'registry-bom', ...value })),
			save: jest.fn((value) => Promise.resolve(value))
		}
		const service = new PluginMarketplaceService({} as any, registryRepository as any, [], {} as any)

		const item = await service.createRegistryItem({
			packageName: '@xpert-ai/plugin-bom',
			displayName: {
				en_US: 'BOM Document Intake',
				zh_Hans: 'BOM 文档接入'
			},
			description: {
				en_US: 'Parse and review BOM documents.',
				zh_Hans: '解析并复核 BOM 文档。'
			},
			category: 'middleware',
			author: 'XpertAI',
			targetApps: ['data-xpert'],
			enabled: false
		})

		expect(item.displayName).toEqual({
			en_US: 'BOM Document Intake',
			zh_Hans: 'BOM 文档接入'
		})
		expect(item.description).toEqual({
			en_US: 'Parse and review BOM documents.',
			zh_Hans: '解析并复核 BOM 文档。'
		})
		expect(registryRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				displayName: 'BOM Document Intake',
				displayNameI18n: {
					en_US: 'BOM Document Intake',
					zh_Hans: 'BOM 文档接入'
				},
				description: 'Parse and review BOM documents.',
				descriptionI18n: {
					en_US: 'Parse and review BOM documents.',
					zh_Hans: '解析并复核 BOM 文档。'
				}
			})
		)
	})

	it('rejects localized metadata without the required English fallback', async () => {
		jest.mocked(RequestContext.hasRole).mockReturnValueOnce(true)
		const service = new PluginMarketplaceService(
			{} as any,
			{ findOne: jest.fn().mockResolvedValue(null) } as any,
			[],
			{} as any
		)

		await expect(
			service.createRegistryItem({
				packageName: '@xpert-ai/plugin-bom',
				displayName: { en_US: '', zh_Hans: 'BOM 文档接入' },
				description: 'Parse and review BOM documents.',
				category: 'middleware',
				author: 'XpertAI',
				targetApps: ['data-xpert'],
				enabled: false
			})
		).rejects.toThrow('displayName is required')
	})
})

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

describe('PluginMarketplaceService marketplace trial shortcuts', () => {
	let service: PluginMarketplaceService
	const source = {
		id: 'source-1',
		name: 'Official',
		type: 'url',
		url: 'https://example.com/plugin-marketplace.json',
		builtin: false
	}
	const installedContext = {
		installedNames: new Set<string>(),
		loadedMetaByName: new Map()
	}

	beforeEach(() => {
		service = new PluginMarketplaceService({} as any, {} as any, [] as any, {} as any)
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	function toMarketplaceItem(input: Record<string, unknown>, targetApp = 'xpert') {
		const plugin = (service as any).normalizeRegistryPlugin(input, source, 0)
		if (!plugin) {
			throw new Error('Expected normalized plugin')
		}
		return (service as any).toMarketplaceItem(plugin, targetApp, installedContext)
	}

	it('normalizes structured target-app trial shortcuts and preserves skill keys', () => {
		const item = toMarketplaceItem({
			name: '@xpert-ai/plugin-documents',
			version: '0.1.0',
			targetAppMeta: {
				xpert: {
					marketplace: {
						contents: [
							{
								type: 'skill',
								name: 'documents',
								displayName: 'Documents'
							}
						],
						trialShortcuts: [
							{
								id: 'memo',
								label: 'Draft a project memo',
								prompt: 'Draft a project memo as a document',
								skillKey: 'documents',
								icon: {
									type: 'font',
									value: 'ri-file-text-line'
								}
							},
							{
								id: 'blank',
								prompt: '   ',
								skillKey: 'documents'
							},
							{
								id: 'outline',
								prompt: 'Create a document from this outline',
								skillKey: 'documents'
							},
							{
								id: 'plan',
								prompt: 'Write a polished doc for this plan',
								skillKey: 'documents'
							},
							{
								id: 'ignored',
								prompt: 'This fourth valid shortcut is ignored',
								skillKey: 'documents'
							}
						]
					}
				}
			}
		})

		expect(item.trialShortcuts).toEqual([
			{
				id: 'memo',
				label: 'Draft a project memo',
				prompt: 'Draft a project memo as a document',
				skillKey: 'documents',
				icon: {
					type: 'font',
					value: 'ri-file-text-line'
				}
			},
			{
				id: 'outline',
				prompt: 'Create a document from this outline',
				skillKey: 'documents'
			},
			{
				id: 'plan',
				prompt: 'Write a polished doc for this plan',
				skillKey: 'documents'
			}
		])
	})

	it('falls back to interface defaultPrompt values when structured shortcuts are absent', () => {
		const item = toMarketplaceItem({
			name: '@xpert-ai/plugin-documents',
			interface: {
				defaultPrompt: [
					'Draft a project memo as a document',
					' ',
					'Create a document from this outline',
					'Write a polished doc for this plan',
					'This fourth valid prompt is ignored'
				]
			},
			targetAppMeta: {
				xpert: {
					marketplace: {
						contents: [
							{
								type: 'skill',
								name: 'documents'
							}
						]
					}
				}
			}
		})

		expect(item.defaultPrompt).toEqual([
			'Draft a project memo as a document',
			'Create a document from this outline',
			'Write a polished doc for this plan',
			'This fourth valid prompt is ignored'
		])
		expect(item.trialShortcuts).toEqual([
			{
				id: 'default-1',
				prompt: 'Draft a project memo as a document'
			},
			{
				id: 'default-2',
				prompt: 'Create a document from this outline'
			},
			{
				id: 'default-3',
				prompt: 'Write a polished doc for this plan'
			}
		])
	})

	it('derives artifact namespace from package names for marketplace items', () => {
		const item = toMarketplaceItem({
			name: '@xpert-ai/plugin-docx-editor',
			version: '0.1.0'
		})

		expect(item.artifactNamespace).toBe('docx_editor')
	})
})

describe('PluginMarketplaceService npm bundle manifest hydration', () => {
	afterEach(() => {
		jest.restoreAllMocks()
	})

	it('hydrates missing target app marketplace metadata from the npm bundle manifest before filtering', async () => {
		const { tempRoot, tarballBytes } = createNpmPluginTarball({
			name: DOCUMENTS_PACKAGE,
			version: DOCUMENTS_VERSION,
			artifactNamespace: 'documents_bundle',
			description: 'Bundle package description',
			interface: {
				displayName: 'Bundle Documents',
				shortDescription: 'Bundle short description',
				defaultPrompt: [
					'Draft a project memo as a document',
					'Create a document from this outline',
					'Write a polished doc for this plan'
				],
				screenshots: ['bundle-screenshot.png']
			},
			targetApps: ['xpert'],
			targetAppMeta: {
				xpert: {
					types: ['skill-plugin'],
					capabilities: ['document-authoring'],
					marketplace: {
						contents: [
							{
								type: 'skill',
								name: 'documents',
								displayName: 'Documents',
								description: 'Create and edit document artifacts',
								icon: {
									type: 'font',
									value: 'ri-file-text-line'
								}
							}
						],
						trialShortcuts: [
							{
								id: 'memo',
								prompt: 'Draft a project memo as a document',
								skillKey: 'documents'
							}
						]
					}
				}
			}
		})

		try {
			mockNpmFetch(tarballBytes)
			const service = createMarketplaceServiceWithPlatformItems([createPlatformRegistryItem()])

			const response = await service.listMarketplace({
				sourceId: 'platform-registry',
				targetApp: 'xpert'
			})

			expect(response.items).toHaveLength(1)
			expect(response.items[0]).toEqual(
				expect.objectContaining({
					name: DOCUMENTS_PACKAGE,
					displayName: 'Registry Documents',
					description: 'Registry curated description',
					artifactNamespace: 'documents_bundle',
					targetApps: ['xpert'],
					defaultPrompt: [
						'Draft a project memo as a document',
						'Create a document from this outline',
						'Write a polished doc for this plan'
					],
					trialShortcuts: [
						{
							id: 'memo',
							prompt: 'Draft a project memo as a document',
							skillKey: 'documents'
						}
					]
				})
			)
			expect(response.items[0].contributions).toEqual([
				expect.objectContaining({
					type: 'skill',
					name: 'documents',
					displayName: 'Documents'
				})
			])
			expect(response.items[0].targetAppMeta?.xpert?.capabilities).toEqual(['document-authoring'])
		} finally {
			rmSync(tempRoot, { recursive: true, force: true })
		}
	})

	it('uses bundle-provided marketplace data URL image assets', async () => {
		const logo = 'data:image/png;base64,bG9nbw=='
		const icon = 'data:image/png;base64,aWNvbg=='
		const background = 'data:image/svg+xml;base64,PHN2Zy8+'
		const { tempRoot, tarballBytes } = createNpmPluginTarball({
			name: DOCUMENTS_PACKAGE,
			version: DOCUMENTS_VERSION,
			interface: {
				displayName: 'Bundle Documents',
				logo,
				screenshots: [background]
			},
			targetApps: ['xpert'],
			targetAppMeta: {
				xpert: {
					types: ['skill-plugin'],
					capabilities: ['document-authoring'],
					marketplace: {
						screenshots: [background],
						contents: [
							{
								type: 'skill',
								name: 'documents',
								displayName: 'Documents',
								icon: {
									type: 'image',
									value: icon
								}
							}
						],
						trialShortcuts: [
							{
								id: 'memo',
								prompt: 'Draft a project memo as a document',
								skillKey: 'documents',
								icon: {
									type: 'image',
									value: icon
								}
							}
						]
					}
				}
			}
		})

		try {
			mockNpmFetch(tarballBytes)
			const service = createMarketplaceServiceWithPlatformItems([createPlatformRegistryItem()])

			const response = await service.listMarketplace({
				sourceId: 'platform-registry',
				targetApp: 'xpert'
			})
			const item = response.items[0]
			const marketplace = item.targetAppMeta?.xpert?.marketplace as any

			expect(item.icon).toEqual({
				type: 'image',
				value: logo
			})
			expect(item.screenshots).toEqual([background])
			expect(marketplace.screenshots).toEqual([background])
			expect(item.contributions[0].icon).toEqual({
				type: 'image',
				value: icon
			})
			expect(item.trialShortcuts[0].icon).toEqual({
				type: 'image',
				value: icon
			})
		} finally {
			rmSync(tempRoot, { recursive: true, force: true })
		}
	})

	it('merges registry target app metadata with bundle manifest metadata while keeping registry curation fields', async () => {
		const { tempRoot, tarballBytes } = createNpmPluginTarball({
			name: DOCUMENTS_PACKAGE,
			version: DOCUMENTS_VERSION,
			targetApps: ['xpert'],
			targetAppMeta: {
				xpert: {
					types: ['bundle-type'],
					capabilities: ['bundle-capability'],
					marketplace: {
						contents: [
							{
								type: 'skill',
								name: 'documents',
								displayName: 'Bundle Documents Skill',
								description: 'Bundle skill description'
							}
						],
						trialShortcuts: [
							{
								id: 'bundle-shortcut',
								prompt: 'Bundle prompt',
								skillKey: 'documents'
							}
						]
					}
				}
			}
		})

		try {
			mockNpmFetch(tarballBytes)
			const service = createMarketplaceServiceWithPlatformItems([
				createPlatformRegistryItem({
					displayName: 'Curated Documents',
					description: 'Curated description',
					targetApps: ['xpert'],
					targetAppMeta: {
						xpert: {
							types: ['registry-type'],
							capabilities: ['registry-capability'],
							marketplace: {
								contents: [
									{
										type: 'skill',
										name: 'documents',
										displayName: 'Registry Documents Skill'
									}
								],
								trialShortcuts: [
									{
										id: 'registry-shortcut',
										prompt: 'Registry prompt',
										skillKey: 'documents'
									}
								]
							}
						}
					}
				})
			])

			const response = await service.listMarketplace({
				sourceId: 'platform-registry',
				targetApp: 'xpert'
			})
			const item = response.items[0]

			expect(item.displayName).toBe('Curated Documents')
			expect(item.description).toBe('Curated description')
			expect(item.targetAppMeta?.xpert?.types).toEqual(['registry-type', 'bundle-type'])
			expect(item.targetAppMeta?.xpert?.capabilities).toEqual(['registry-capability', 'bundle-capability'])
			expect(item.contributions).toEqual([
				expect.objectContaining({
					type: 'skill',
					name: 'documents',
					displayName: 'Bundle Documents Skill',
					description: 'Bundle skill description'
				})
			])
			expect(item.trialShortcuts).toEqual([
				{
					id: 'bundle-shortcut',
					prompt: 'Bundle prompt',
					skillKey: 'documents'
				}
			])
		} finally {
			rmSync(tempRoot, { recursive: true, force: true })
		}
	})

	it('keeps marketplace listing available when the npm bundle manifest cannot be loaded', async () => {
		mockNpmFetch(null)
		const service = createMarketplaceServiceWithPlatformItems([
			createPlatformRegistryItem({
				targetApps: ['xpert']
			})
		])
		jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined)

		const response = await service.listMarketplace({
			sourceId: 'platform-registry',
			targetApp: 'xpert'
		})

		expect(response.items).toHaveLength(1)
		expect(response.items[0]).toEqual(
			expect.objectContaining({
				name: DOCUMENTS_PACKAGE,
				targetApps: ['xpert'],
				contributions: [],
				trialShortcuts: []
			})
		)
	})
})
