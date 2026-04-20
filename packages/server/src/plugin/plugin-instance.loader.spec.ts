const mockGetConfig = jest.fn(() => ({
	dbConnectionOptions: {
		type: 'postgres'
	}
}))
const mockHasTable = jest.fn()
const mockRelease = jest.fn()
const mockQuery = jest.fn()
const mockInitialize = jest.fn()
const mockDestroy = jest.fn()
const mockCreateQueryRunner = jest.fn(() => ({
	hasTable: mockHasTable,
	release: mockRelease
}))

jest.mock('@xpert-ai/server-config', () => ({
	environment: {
		secretsEncryptionKey: 'test-key'
	},
	getConfig: mockGetConfig
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: '__global__'
}))

jest.mock('typeorm', () => ({
	DataSource: jest.fn().mockImplementation(() => ({
		initialize: mockInitialize,
		destroy: mockDestroy,
		query: mockQuery,
		createQueryRunner: mockCreateQueryRunner
	}))
}))

import { GLOBAL_ORGANIZATION_SCOPE } from '@xpert-ai/plugin-sdk'
import {
	buildOrganizationPluginConfigs,
	loadOrganizationPluginConfigs,
	loadPluginInstances
} from './plugin-instance.loader'

describe('plugin instance loader', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		mockGetConfig.mockReturnValue({
			dbConnectionOptions: {
				type: 'postgres'
			}
		})
		mockInitialize.mockResolvedValue(undefined)
		mockDestroy.mockResolvedValue(undefined)
		mockRelease.mockResolvedValue(undefined)
	})

	it('restores code plugins by package name instead of a versioned npm spec', () => {
		const configs = buildOrganizationPluginConfigs([
			{
				organizationId: 'org-1',
				pluginName: '@xpert-ai/plugin-code-demo',
				packageName: '@xpert-ai/plugin-code-demo',
				version: '1.2.3',
				source: 'code',
				sourceConfig: {
					workspacePath: '/tmp/workspaces/plugin-code-demo'
				},
				level: 'organization',
				config: {}
			},
			{
				organizationId: 'org-1',
				pluginName: '@xpert-ai/plugin-market-demo',
				packageName: '@xpert-ai/plugin-market-demo',
				version: '2.0.0',
				source: 'marketplace',
				sourceConfig: null,
				level: 'organization',
				config: {}
			}
		])

		expect(configs).toEqual([
			{
				organizationId: 'org-1',
				plugins: [
					{
						name: '@xpert-ai/plugin-code-demo',
						version: '1.2.3',
						source: 'code',
						sourceConfig: {
							workspacePath: '/tmp/workspaces/plugin-code-demo'
						},
						level: 'organization'
					},
					{
						name: '@xpert-ai/plugin-market-demo@2.0.0',
						version: '2.0.0',
						source: 'marketplace',
						sourceConfig: null,
						level: 'organization'
					}
				],
				configs: {
					'@xpert-ai/plugin-code-demo': {},
					'@xpert-ai/plugin-market-demo': {}
				}
			}
		])
	})

	it('falls back to the global organization scope for persisted global plugins', () => {
		const configs = buildOrganizationPluginConfigs([
			{
				organizationId: null,
				pluginName: '@xpert-ai/plugin-global-demo',
				packageName: '@xpert-ai/plugin-global-demo',
				version: '1.0.0',
				source: 'marketplace',
				sourceConfig: null,
				level: 'organization',
				config: {}
			}
		])

		expect(configs).toEqual([
			{
				organizationId: GLOBAL_ORGANIZATION_SCOPE,
				plugins: [
					{
						name: '@xpert-ai/plugin-global-demo@1.0.0',
						version: '1.0.0',
						source: 'marketplace',
						sourceConfig: null,
						level: 'organization'
					}
				],
				configs: {
					'@xpert-ai/plugin-global-demo': {}
				}
			}
		])
	})

	it('returns no persisted plugin rows when the plugin_instance table is not available yet', async () => {
		mockHasTable.mockResolvedValue(false)

		await expect(loadPluginInstances()).resolves.toEqual([])
		expect(mockQuery).not.toHaveBeenCalled()
		expect(mockHasTable).toHaveBeenCalledWith('plugin_instance')
		expect(mockRelease).toHaveBeenCalledTimes(1)
		expect(mockDestroy).toHaveBeenCalledTimes(1)
	})

	it('skips warning logs when the plugin_instance table is missing during first bootstrap', async () => {
		mockHasTable.mockResolvedValue(false)
		const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

		await expect(loadOrganizationPluginConfigs()).resolves.toEqual([])
		expect(warnSpy).not.toHaveBeenCalled()

		warnSpy.mockRestore()
	})
})
