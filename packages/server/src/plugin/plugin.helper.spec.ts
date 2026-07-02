jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: '__global__',
	SYSTEM_GLOBAL_SCOPE: 'system:global',
	TENANT_GLOBAL_SCOPE_PREFIX: 'tenant:',
	TENANT_GLOBAL_SCOPE_SUFFIX: ':global',
	getTenantGlobalScopeKey: (tenantId: string) => `tenant:${tenantId}:global`,
	isTenantGlobalScopeKey: (value?: string | null) =>
		typeof value === 'string' && value.startsWith('tenant:') && value.endsWith(':global'),
	getErrorMessage: jest.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
	ORGANIZATION_METADATA_KEY: 'organization-metadata',
	PLUGIN_METADATA: {
		ENTITIES: 'plugin:entities',
		SUBSCRIBERS: 'plugin:subscribers'
	},
	PLUGIN_METADATA_KEY: 'plugin-metadata'
}))

jest.mock('./organization-plugin.store', () => ({
	getOrganizationManifestPath: jest.fn(() => '/tmp/plugins/org-1/plugins.json'),
	getOrganizationPluginPath: jest.fn((organizationId: string, pluginName: string) => {
		const sanitizedName = pluginName.replace(/\//g, '__')
		return `/tmp/plugins/${organizationId}/${sanitizedName}`
	}),
	getOrganizationPluginRoot: jest.fn((organizationId: string) => `/tmp/plugins/${organizationId}`),
	installOrganizationPlugins: jest.fn(),
	stagePackageDirectoryPlugin: jest.fn(),
	stageWorkspacePlugin: jest.fn()
}))

jest.mock('./plugin-loader', () => ({
	loadPlugin: jest.fn(async (name: string) => ({
		meta: {
			name,
			version: '1.0.0',
			level: 'organization'
		},
		register: jest.fn(() => ({
			module: class RuntimePluginModule {}
		}))
	}))
}))

jest.mock('./config', () => ({
	inspectConfig: jest.fn((_: string, config: Record<string, unknown>) => ({
		config: config ?? {}
	}))
}))

jest.mock('./lifecycle', () => ({
	createPluginContext: jest.fn(() => ({
		config: {}
	}))
}))

jest.mock('./plugin-instance.entity', () => ({
	resolvePluginLevel: jest.fn((level?: string) => level ?? 'organization')
}))

const {
	installOrganizationPlugins,
	stagePackageDirectoryPlugin,
	stageWorkspacePlugin
} = require('./organization-plugin.store')
const { GLOBAL_ORGANIZATION_SCOPE } = require('@xpert-ai/plugin-sdk')
const { loadPlugin } = require('./plugin-loader')
const {
	PLUGIN_SYSTEM_LEVEL_INSTALL_FORBIDDEN_CODE,
	loaded,
	loadFailures,
	collectProvidersWithMetadata,
	registerPluginsAsync
} = require('./plugin.helper')

describe('plugin helper registerPluginsAsync', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		loaded.length = 0
		loadFailures.length = 0
	})

	it('restages code plugins from their workspace path before loading them', async () => {
		await expect(
			registerPluginsAsync({
				organizationId: 'org-1',
				plugins: [
					{
						name: '@xpert-ai/plugin-code-demo',
						source: 'code',
						sourceConfig: {
							workspacePath: '/tmp/workspaces/plugin-code-demo'
						}
					}
				],
				configs: {
					'@xpert-ai/plugin-code-demo': {}
				}
			})
		).resolves.toEqual(
			expect.objectContaining({
				organizationId: 'org-1',
				errors: []
			})
		)

		expect(stageWorkspacePlugin).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: 'org-1',
				pluginName: '@xpert-ai/plugin-code-demo',
				expectedPackageName: '@xpert-ai/plugin-code-demo',
				workspacePath: '/tmp/workspaces/plugin-code-demo',
				rootDir: undefined,
				manifestName: undefined
			})
		)
		expect(installOrganizationPlugins).toHaveBeenCalledWith('org-1', [], expect.any(Object))
		expect(loadPlugin).toHaveBeenCalledWith('@xpert-ai/plugin-code-demo', {
			basedir: '/tmp/plugins/org-1/@xpert-ai__plugin-code-demo',
			source: 'code',
			workspacePath: '/tmp/workspaces/plugin-code-demo',
			codeLoadMode: 'staged-package',
			onCompatibilityWarnings: expect.any(Function)
		})
		expect(loaded).toEqual([
			expect.objectContaining({
				organizationId: 'org-1',
				name: '@xpert-ai/plugin-code-demo',
				packageName: '@xpert-ai/plugin-code-demo',
				source: 'code',
				sourceConfig: {
					workspacePath: '/tmp/workspaces/plugin-code-demo'
				}
			})
		])
	})

	it('records sdk compatibility warnings on loaded plugin records', async () => {
		const warnings = [
			{
				code: 'plugin-sdk-peer-range-incompatible',
				packageName: '@xpert-ai/plugin-code-demo',
				hostVersion: '4.0.0',
				peerRange: '^3.9.1',
				message:
					'@xpert-ai/plugin-sdk peerDependencies range "^3.9.1" is incompatible with host SDK version 4.0.0.'
			}
		]

		;(loadPlugin as jest.Mock).mockImplementationOnce(
			async (
				name: string,
				options: {
					onCompatibilityWarnings?: (value: typeof warnings) => void
				}
			) => {
				options.onCompatibilityWarnings?.(warnings)
				return {
					meta: {
						name,
						version: '1.0.0',
						level: 'organization'
					},
					register: jest.fn(() => ({
						module: class RuntimePluginModule {}
					}))
				}
			}
		)

		await expect(
			registerPluginsAsync({
				organizationId: 'org-1',
				plugins: [
					{
						name: '@xpert-ai/plugin-code-demo',
						source: 'code',
						sourceConfig: {
							workspacePath: '/tmp/workspaces/plugin-code-demo'
						}
					}
				],
				configs: {
					'@xpert-ai/plugin-code-demo': {}
				}
			})
		).resolves.toEqual(
			expect.objectContaining({
				organizationId: 'org-1',
				errors: []
			})
		)

		expect(loaded).toEqual([
			expect.objectContaining({
				name: '@xpert-ai/plugin-code-demo',
				sdkCompatibilityWarnings: warnings
			})
		])
	})

	it('tags non-default tenant global plugins with a tenant-isolated scope key', async () => {
		await expect(
			registerPluginsAsync({
				tenantId: 'tenant-other',
				defaultTenantId: 'tenant-default',
				organizationId: GLOBAL_ORGANIZATION_SCOPE,
				plugins: [
					{
						name: '@xpert-ai/plugin-global-demo',
						source: 'code',
						sourceConfig: {
							workspacePath: '/tmp/workspaces/plugin-global-demo'
						}
					}
				],
				configs: {
					'@xpert-ai/plugin-global-demo': {}
				}
			})
		).resolves.toEqual(
			expect.objectContaining({
				tenantId: 'tenant-other',
				organizationId: GLOBAL_ORGANIZATION_SCOPE,
				scopeKey: 'tenant:tenant-other:global',
				errors: []
			})
		)

		expect(stageWorkspacePlugin).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: 'tenant-other',
				defaultTenantId: 'tenant-default',
				scopeKey: 'tenant:tenant-other:global'
			})
		)
		expect(loaded).toEqual([
			expect.objectContaining({
				tenantId: 'tenant-other',
				organizationId: GLOBAL_ORGANIZATION_SCOPE,
				scopeKey: 'tenant:tenant-other:global',
				name: '@xpert-ai/plugin-global-demo'
			})
		])
	})

	it('rejects system plugins before registering modules when system installs are not allowed', async () => {
		const register = jest.fn(() => ({
			module: class RuntimePluginModule {}
		}))
		;(loadPlugin as jest.Mock).mockResolvedValueOnce({
			meta: {
				name: '@xpert-ai/plugin-system-demo',
				version: '1.0.0',
				level: 'system'
			},
			register
		})

		await expect(
			registerPluginsAsync({
				organizationId: 'org-1',
				plugins: [
					{
						name: '@xpert-ai/plugin-system-demo',
						source: 'npm'
					}
				],
				configs: {
					'@xpert-ai/plugin-system-demo': {}
				},
				allowSystemPlugins: false
			})
		).resolves.toEqual(
			expect.objectContaining({
				organizationId: 'org-1',
				modules: [],
				errors: [
					expect.objectContaining({
						code: PLUGIN_SYSTEM_LEVEL_INSTALL_FORBIDDEN_CODE,
						pluginName: '@xpert-ai/plugin-system-demo'
					})
				]
			})
		)

		expect(register).not.toHaveBeenCalled()
		expect(loaded).toEqual([])
		expect(loadFailures).toEqual([])
	})

	it('restages monorepo code plugins even when no workspacePath is persisted', async () => {
		await expect(
			registerPluginsAsync({
				organizationId: 'org-1',
				plugins: [
					{
						name: '@xpert-ai/plugin-vlm-default',
						source: 'code'
					}
				],
				configs: {
					'@xpert-ai/plugin-vlm-default': {}
				}
			})
		).resolves.toEqual(
			expect.objectContaining({
				organizationId: 'org-1',
				errors: []
			})
		)

		expect(stageWorkspacePlugin).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: 'org-1',
				pluginName: '@xpert-ai/plugin-vlm-default',
				expectedPackageName: '@xpert-ai/plugin-vlm-default',
				workspacePath: expect.stringMatching(/packages\/plugins\/vlm-default$/),
				rootDir: undefined,
				manifestName: undefined
			})
		)
		expect(loadPlugin).toHaveBeenCalledWith('@xpert-ai/plugin-vlm-default', {
			basedir: '/tmp/plugins/org-1/@xpert-ai__plugin-vlm-default',
			source: 'code',
			workspacePath: expect.stringMatching(/packages\/plugins\/vlm-default$/),
			codeLoadMode: 'workspace-ts',
			onCompatibilityWarnings: expect.any(Function)
		})
		expect(loaded).toEqual([
			expect.objectContaining({
				name: '@xpert-ai/plugin-vlm-default',
				source: 'code',
				sourceConfig: {
					workspacePath: expect.stringMatching(/packages\/plugins\/vlm-default$/)
				}
			})
		])
	})

	it('loads code plugins from a runtime-specific staged directory without changing the logical package name', async () => {
		await expect(
			registerPluginsAsync({
				organizationId: 'org-1',
				plugins: [
					{
						name: '@xpert-ai/plugin-code-demo',
						runtimeName: '@xpert-ai/plugin-code-demo@runtime__abc123',
						source: 'code',
						sourceConfig: {
							workspacePath: '/tmp/workspaces/plugin-code-demo'
						}
					}
				],
				configs: {
					'@xpert-ai/plugin-code-demo': {}
				}
			})
		).resolves.toEqual(
			expect.objectContaining({
				organizationId: 'org-1',
				errors: []
			})
		)

		expect(stageWorkspacePlugin).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: 'org-1',
				pluginName: '@xpert-ai/plugin-code-demo@runtime__abc123',
				expectedPackageName: '@xpert-ai/plugin-code-demo',
				workspacePath: '/tmp/workspaces/plugin-code-demo',
				rootDir: undefined,
				manifestName: undefined
			})
		)
		expect(loadPlugin).toHaveBeenCalledWith('@xpert-ai/plugin-code-demo', {
			basedir: '/tmp/plugins/org-1/@xpert-ai__plugin-code-demo@runtime__abc123',
			source: 'code',
			workspacePath: '/tmp/workspaces/plugin-code-demo',
			codeLoadMode: 'staged-package',
			onCompatibilityWarnings: expect.any(Function)
		})
		expect(loaded).toEqual([
			expect.objectContaining({
				organizationId: 'org-1',
				name: '@xpert-ai/plugin-code-demo',
				packageName: '@xpert-ai/plugin-code-demo',
				baseDir: '/tmp/plugins/org-1/@xpert-ai__plugin-code-demo@runtime__abc123',
				source: 'code'
			})
		])
	})

	it('stages uploaded package directories before loading code plugins', async () => {
		await expect(
			registerPluginsAsync({
				organizationId: 'org-1',
				plugins: [
					{
						name: '@xpert-ai/plugin-uploaded-demo',
						runtimeName: '@xpert-ai/plugin-uploaded-demo@runtime__abc123',
						source: 'code',
						sourceConfig: {
							packageDir: '/tmp/xpert-plugin-upload-abc/package',
							runtimeName: '@xpert-ai/plugin-uploaded-demo@runtime__abc123',
							uploadFileName: 'plugin-uploaded-demo.tgz'
						}
					}
				],
				configs: {
					'@xpert-ai/plugin-uploaded-demo': {}
				}
			})
		).resolves.toEqual(
			expect.objectContaining({
				organizationId: 'org-1',
				errors: []
			})
		)

		expect(stagePackageDirectoryPlugin).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: 'org-1',
				pluginName: '@xpert-ai/plugin-uploaded-demo@runtime__abc123',
				expectedPackageName: '@xpert-ai/plugin-uploaded-demo',
				packageDir: '/tmp/xpert-plugin-upload-abc/package',
				rootDir: undefined,
				manifestName: undefined
			})
		)
		expect(loadPlugin).toHaveBeenCalledWith('@xpert-ai/plugin-uploaded-demo', {
			basedir: '/tmp/plugins/org-1/@xpert-ai__plugin-uploaded-demo@runtime__abc123',
			source: 'code',
			workspacePath: undefined,
			codeLoadMode: 'staged-package',
			onCompatibilityWarnings: expect.any(Function)
		})
	})

	it('appends stageWorkspacePlugin errors to subsequent load failures', async () => {
		const stageError = new Error('workspacePath must be an absolute path')
		const loadError = new Error('Cannot find module ./dist/index.js')
		const logger = {
			error: jest.fn()
		}
		const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

		;(stageWorkspacePlugin as jest.Mock).mockImplementationOnce(() => {
			throw stageError
		})
		;(loadPlugin as jest.Mock).mockRejectedValueOnce(loadError)

		try {
			await expect(
				registerPluginsAsync(
					{
						organizationId: 'org-1',
						plugins: [
							{
								name: '@xpert-ai/plugin-code-demo',
								source: 'code',
								sourceConfig: {
									workspacePath: '/tmp/workspaces/plugin-code-demo'
								}
							}
						],
						configs: {
							'@xpert-ai/plugin-code-demo': {}
						}
					},
					logger as any
				)
			).resolves.toEqual(
				expect.objectContaining({
					errors: [
						expect.objectContaining({
							error: 'Cannot find module ./dist/index.js | stageWorkspacePlugin failed earlier: workspacePath must be an absolute path'
						})
					]
				})
			)

			expect(loadFailures).toEqual([
				expect.objectContaining({
					organizationId: 'org-1',
					pluginName: '@xpert-ai/plugin-code-demo',
					packageName: '@xpert-ai/plugin-code-demo',
					error: 'Cannot find module ./dist/index.js | stageWorkspacePlugin failed earlier: workspacePath must be an absolute path'
				})
			])
		} finally {
			consoleErrorSpy.mockRestore()
		}
	})

	it('collects providers only from modules added after the module snapshot', () => {
		class ExistingPluginModule {}
		class FreshPluginModule {}
		class ExistingProvider {}
		class FreshProvider {}

		;(Reflect as any).defineMetadata('organization-metadata', 'org-1', ExistingPluginModule)
		;(Reflect as any).defineMetadata('plugin-metadata', '@xpert-ai/plugin-code-demo', ExistingPluginModule)
		;(Reflect as any).defineMetadata('organization-metadata', 'org-1', FreshPluginModule)
		;(Reflect as any).defineMetadata('plugin-metadata', '@xpert-ai/plugin-code-demo', FreshPluginModule)

		const existingProvider = new ExistingProvider()
		const freshProvider = new FreshProvider()
		const moduleRef = {
			container: {
				getModules: () =>
					new Map<string, any>([
						[
							'existing',
							{
								id: 'existing-id',
								metatype: ExistingPluginModule,
								providers: new Map([['existing-provider', { instance: existingProvider }]])
							}
						],
						[
							'fresh',
							{
								id: 'fresh-id',
								metatype: FreshPluginModule,
								providers: new Map([['fresh-provider', { instance: freshProvider }]])
							}
						]
					])
			}
		}
		const logger = {
			debug: jest.fn()
		}

		expect(
			collectProvidersWithMetadata(
				moduleRef as any,
				'org-1',
				'@xpert-ai/plugin-code-demo',
				logger as any,
				new Set(['existing-id'])
			)
		).toEqual([freshProvider])
	})
})
