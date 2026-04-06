jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: '__global__',
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

const { installOrganizationPlugins, stageWorkspacePlugin } = require('./organization-plugin.store')
const { loadPlugin } = require('./plugin-loader')
const { loaded, collectProvidersWithMetadata, registerPluginsAsync } = require('./plugin.helper')

describe('plugin helper registerPluginsAsync', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		loaded.length = 0
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

		expect(stageWorkspacePlugin).toHaveBeenCalledWith({
			organizationId: 'org-1',
			pluginName: '@xpert-ai/plugin-code-demo',
			expectedPackageName: '@xpert-ai/plugin-code-demo',
			workspacePath: '/tmp/workspaces/plugin-code-demo',
			rootDir: undefined,
			manifestName: undefined
		})
		expect(installOrganizationPlugins).toHaveBeenCalledWith('org-1', [], expect.any(Object))
		expect(loadPlugin).toHaveBeenCalledWith('@xpert-ai/plugin-code-demo', {
			basedir: '/tmp/plugins/org-1/@xpert-ai__plugin-code-demo',
			source: 'code',
			workspacePath: '/tmp/workspaces/plugin-code-demo'
		})
		expect(loaded).toEqual([
			expect.objectContaining({
				organizationId: 'org-1',
				name: '@xpert-ai/plugin-code-demo',
				packageName: '@xpert-ai/plugin-code-demo',
				source: 'code'
			})
		])
	})

	it('restages monorepo code plugins even when no workspacePath is persisted', async () => {
		await expect(
			registerPluginsAsync({
				organizationId: 'org-1',
				plugins: [
					{
						name: '@xpert-ai/plugin-trigger-schedule',
						source: 'code'
					}
				],
				configs: {
					'@xpert-ai/plugin-trigger-schedule': {}
				}
			})
		).resolves.toEqual(
			expect.objectContaining({
				organizationId: 'org-1',
				errors: []
			})
		)

		expect(stageWorkspacePlugin).toHaveBeenCalledWith({
			organizationId: 'org-1',
			pluginName: '@xpert-ai/plugin-trigger-schedule',
			expectedPackageName: '@xpert-ai/plugin-trigger-schedule',
			workspacePath: expect.stringMatching(/packages\/plugins\/trigger-schedule$/),
			rootDir: undefined,
			manifestName: undefined
		})
		expect(loadPlugin).toHaveBeenCalledWith('@xpert-ai/plugin-trigger-schedule', {
			basedir: '/tmp/plugins/org-1/@xpert-ai__plugin-trigger-schedule',
			source: 'code',
			workspacePath: expect.stringMatching(/packages\/plugins\/trigger-schedule$/)
		})
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

		expect(stageWorkspacePlugin).toHaveBeenCalledWith({
			organizationId: 'org-1',
			pluginName: '@xpert-ai/plugin-code-demo@runtime__abc123',
			expectedPackageName: '@xpert-ai/plugin-code-demo',
			workspacePath: '/tmp/workspaces/plugin-code-demo',
			rootDir: undefined,
			manifestName: undefined
		})
		expect(loadPlugin).toHaveBeenCalledWith('@xpert-ai/plugin-code-demo', {
			basedir: '/tmp/plugins/org-1/@xpert-ai__plugin-code-demo@runtime__abc123',
			source: 'code',
			workspacePath: '/tmp/workspaces/plugin-code-demo'
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
