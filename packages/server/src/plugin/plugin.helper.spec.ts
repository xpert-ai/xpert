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
const { loaded, registerPluginsAsync } = require('./plugin.helper')

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
			basedir: '/tmp/plugins/org-1/@xpert-ai__plugin-code-demo'
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
})
