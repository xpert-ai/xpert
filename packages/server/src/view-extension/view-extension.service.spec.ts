import { RequestContext } from '../core/context'
import { ViewExtensionService } from './view-extension.service'

describe('ViewExtensionService file actions', () => {
	const manifest = {
		key: 'review',
		title: { en_US: 'Review', zh_Hans: '审核' },
		hostType: 'agent',
		slot: 'main',
		source: {
			provider: 'provider',
			plugin: 'test'
		},
		view: {
			type: 'raw_json'
		},
		dataSource: {
			mode: 'platform'
		},
		fileAccess: {
			purposes: ['preview']
		},
		actions: [
			{
				key: 'preview_material_excel',
				label: { en_US: 'Preview', zh_Hans: '预览' },
				actionType: 'invoke',
				transport: 'file'
			},
			{
				key: 'json_action',
				label: { en_US: 'JSON Action', zh_Hans: 'JSON操作' },
				actionType: 'invoke'
			}
		]
	} as any

	beforeEach(() => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
		jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
		jest.spyOn(RequestContext, 'getLanguageCode').mockReturnValue('en-US' as any)
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	function createService() {
		const provider = {
			supports: jest.fn(async () => true),
			getViewManifests: jest.fn(async () => [manifest]),
			getViewData: jest.fn(),
			resolveViewFile: jest.fn(async () => ({
				reference: {
					source: 'platform.workspace.files',
					filePath: '/tenant-1/xperts/assistant-1/video.mp4',
					tenantId: 'tenant-1'
				},
				fileName: 'video.mp4',
				mimeType: 'video/mp4',
				size: 1024
			})),
			executeViewFileAction: jest.fn(async () => ({ success: true, refresh: true })),
			getRemoteComponentEntry: jest.fn(async () => ({
				html: '<!doctype html><html><body><div id="root"></div><script type="module"></script></body></html>'
			}))
		}
		const providerRegistry = {
			get: jest.fn(() => provider)
		}
		const hostDefinition = {
			slots: [{ key: 'main', order: 1 }],
			resolve: jest.fn(async () => ({
				workspaceId: 'workspace-1',
				hostSnapshot: { id: 'assistant-1' },
				context: {
					capabilities: {}
				}
			}))
		}
		const hostDefinitionRegistry = {
			get: jest.fn(() => hostDefinition)
		}
		const permissionService = {
			assertHostReadable: jest.fn(),
			ensureManifestVisible: jest.fn(),
			ensureActionVisible: jest.fn()
		}
		const cacheService = {
			invalidateView: jest.fn()
		}
		const service = new ViewExtensionService(
			providerRegistry as any,
			hostDefinitionRegistry as any,
			permissionService as any,
			cacheService as any
		)
		return { service, provider, cacheService }
	}

	it('loads remote component entries for vue runtime views', async () => {
		const { service, provider } = createService()
		const remoteManifest = {
			...manifest,
			key: 'remote',
			view: {
				type: 'remote_component',
				runtime: 'vue',
				protocolVersion: 1,
				component: {
					isolation: 'iframe',
					entry: 'pencil-workbench'
				},
				dataSource: {
					mode: 'platform'
				}
			},
			actions: []
		}
		provider.getViewManifests.mockResolvedValue([remoteManifest])

		const result = await service.getRemoteComponentEntry('agent', 'assistant-1', 'provider__remote')

		expect(result.contentType).toBe('text/html; charset=utf-8')
		expect(result.html).toContain('type="module"')
		expect(provider.getRemoteComponentEntry).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				hostId: 'assistant-1'
			}),
			'remote',
			remoteManifest.view.component
		)
	})

	it('routes file actions to the resolved provider and invalidates refreshed views', async () => {
		const { service, provider, cacheService } = createService()
		const file = { buffer: Buffer.from('excel'), originalname: 'bom.xlsx' }

		const result = await service.executeFileAction(
			'agent',
			'assistant-1',
			'provider__review',
			'preview_material_excel',
			{ parameters: { viewMode: 'maintenance' } },
			file
		)

		expect(result.success).toBe(true)
		expect(provider.executeViewFileAction).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				hostId: 'assistant-1'
			}),
			'review',
			'preview_material_excel',
			{ parameters: { viewMode: 'maintenance' } },
			file
		)
		expect(cacheService.invalidateView).toHaveBeenCalledWith(expect.any(Object), 'provider__review')
	})

	it('returns a clear error when the action is not declared on the view', async () => {
		const { service } = createService()

		await expect(
			service.executeFileAction(
				'agent',
				'assistant-1',
				'provider__review',
				'missing_file_action',
				{},
				{ buffer: Buffer.from('excel') }
			)
		).rejects.toThrow("Action 'missing_file_action' was not found")
	})

	it('rejects file requests for JSON actions', async () => {
		const { service } = createService()

		await expect(
			service.executeFileAction(
				'agent',
				'assistant-1',
				'provider__review',
				'json_action',
				{},
				{ buffer: Buffer.from('excel') }
			)
		).rejects.toThrow("Action 'json_action' does not support file transport")
	})

	it('resolves declared view file access through the provider with the scoped host context', async () => {
		const { service, provider } = createService()

		const result = await service.resolveViewFileResource('agent', 'assistant-1', 'provider__review', {
			fileKey: 'asset-1',
			targetId: 'project-1',
			purpose: 'preview'
		})

		expect(result.resource).toMatchObject({ fileName: 'video.mp4', mimeType: 'video/mp4', size: 1024 })
		expect(provider.resolveViewFile).toHaveBeenCalledWith(
			expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1', hostId: 'assistant-1' }),
			'review',
			{ fileKey: 'asset-1', targetId: 'project-1', purpose: 'preview' }
		)
	})

	it('rejects a file access purpose that the view did not declare', async () => {
		const { service, provider } = createService()

		await expect(
			service.resolveViewFileResource('agent', 'assistant-1', 'provider__review', {
				fileKey: 'asset-1',
				purpose: 'download'
			})
		).rejects.toThrow("File access purpose 'download' is not available")
		expect(provider.resolveViewFile).not.toHaveBeenCalled()
	})
})
