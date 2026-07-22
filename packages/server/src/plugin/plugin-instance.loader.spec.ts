const mockGetConfig = jest.fn(() => ({
	dbConnectionOptions: {
		type: 'postgres'
	}
}))
const mockHasTable = jest.fn()
const mockHasColumn = jest.fn()
const mockRelease = jest.fn()
const mockQuery = jest.fn()
const mockInitialize = jest.fn()
const mockDestroy = jest.fn()
const mockCreateQueryRunner = jest.fn(() => ({
	hasTable: mockHasTable,
	hasColumn: mockHasColumn,
	release: mockRelease
}))

jest.mock('@xpert-ai/server-config', () => ({
	environment: {
		secretsEncryptionKey: 'test-key'
	},
	getConfig: mockGetConfig
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: '__global__',
	SYSTEM_GLOBAL_SCOPE: 'system:global',
	TENANT_GLOBAL_SCOPE_PREFIX: 'tenant:',
	TENANT_GLOBAL_SCOPE_SUFFIX: ':global',
	getTenantGlobalScopeKey: (tenantId: string) => `tenant:${tenantId}:global`,
	isTenantGlobalScopeKey: (value?: string | null) =>
		typeof value === 'string' && value.startsWith('tenant:') && value.endsWith(':global'),
	setDefaultTenantId: jest.fn()
}))

jest.mock('typeorm', () => ({
	DataSource: jest.fn().mockImplementation(() => ({
		initialize: mockInitialize,
		destroy: mockDestroy,
		query: mockQuery,
		createQueryRunner: mockCreateQueryRunner
	}))
}))

import { GLOBAL_ORGANIZATION_SCOPE, SYSTEM_GLOBAL_SCOPE } from '@xpert-ai/plugin-sdk'
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
		mockHasColumn.mockResolvedValue(true)
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
				tenantId: null,
				organizationId: 'org-1',
				scopeKey: 'org-1',
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

	it('restores uploaded code plugins with their persisted staged runtime name', () => {
		const configs = buildOrganizationPluginConfigs([
			{
				organizationId: 'org-1',
				pluginName: '@xpert-ai/plugin-uploaded-demo',
				packageName: '@xpert-ai/plugin-uploaded-demo',
				version: '0.2.0',
				source: 'code',
				sourceConfig: {
					runtimeName: '@xpert-ai/plugin-uploaded-demo@runtime__abc123',
					uploadFileName: 'plugin-uploaded-demo.tgz'
				},
				level: 'organization',
				config: {}
			}
		])

		expect(configs).toEqual([
			{
				tenantId: null,
				organizationId: 'org-1',
				scopeKey: 'org-1',
				plugins: [
					{
						name: '@xpert-ai/plugin-uploaded-demo',
						runtimeName: '@xpert-ai/plugin-uploaded-demo@runtime__abc123',
						version: '0.2.0',
						source: 'code',
						sourceConfig: {
							runtimeName: '@xpert-ai/plugin-uploaded-demo@runtime__abc123',
							uploadFileName: 'plugin-uploaded-demo.tgz'
						},
						level: 'organization'
					}
				],
				configs: {
					'@xpert-ai/plugin-uploaded-demo': {}
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
				tenantId: null,
				organizationId: GLOBAL_ORGANIZATION_SCOPE,
				scopeKey: GLOBAL_ORGANIZATION_SCOPE,
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

	it('groups global plugin rows by tenant while keeping the Default Tenant on the legacy global scope', () => {
		const configs = buildOrganizationPluginConfigs(
			[
				{
					tenantId: 'tenant-default',
					organizationId: null,
					pluginName: '@xpert-ai/plugin-default-global',
					packageName: '@xpert-ai/plugin-default-global',
					version: '1.0.0',
					source: 'marketplace',
					sourceConfig: null,
					level: 'organization',
					config: {}
				},
				{
					tenantId: 'tenant-other',
					organizationId: null,
					pluginName: '@xpert-ai/plugin-other-global',
					packageName: '@xpert-ai/plugin-other-global',
					version: '1.0.0',
					source: 'marketplace',
					sourceConfig: null,
					level: 'organization',
					config: {}
				}
			],
			{
				defaultTenantId: 'tenant-default'
			}
		)

		expect(configs).toEqual([
			expect.objectContaining({
				tenantId: 'tenant-default',
				organizationId: GLOBAL_ORGANIZATION_SCOPE,
				scopeKey: GLOBAL_ORGANIZATION_SCOPE,
				plugins: [expect.objectContaining({ name: '@xpert-ai/plugin-default-global@1.0.0' })]
			}),
			expect.objectContaining({
				tenantId: 'tenant-other',
				organizationId: GLOBAL_ORGANIZATION_SCOPE,
				scopeKey: 'tenant:tenant-other:global',
				plugins: [expect.objectContaining({ name: '@xpert-ai/plugin-other-global@1.0.0' })]
			})
		])
	})

	it('restores system-level plugins into the singleton system scope', () => {
		const configs = buildOrganizationPluginConfigs([
			{
				tenantId: 'tenant-other',
				organizationId: null,
				pluginName: '@xpert-ai/plugin-system-demo',
				packageName: '@xpert-ai/plugin-system-demo',
				version: '1.0.0',
				source: 'marketplace',
				sourceConfig: null,
				level: 'system',
				config: {}
			}
		])

		expect(configs).toEqual([
			{
				tenantId: null,
				organizationId: GLOBAL_ORGANIZATION_SCOPE,
				scopeKey: SYSTEM_GLOBAL_SCOPE,
				plugins: [
					{
						name: '@xpert-ai/plugin-system-demo@1.0.0',
						version: '1.0.0',
						source: 'marketplace',
						sourceConfig: null,
						level: 'system'
					}
				],
				configs: {
					'@xpert-ai/plugin-system-demo': {}
				}
			}
		])
	})

	it('restores tenant-level plugins only in their owning tenant global scope', () => {
		const configs = buildOrganizationPluginConfigs(
			[
				{
					tenantId: 'tenant-bom',
					organizationId: null,
					scopeKey: 'tenant:tenant-bom:global',
					pluginName: '@xpert-ai/plugin-bom',
					packageName: '@xpert-ai/plugin-bom',
					version: '1.0.0',
					source: 'marketplace',
					sourceConfig: null,
					level: 'tenant',
					config: {}
				}
			],
			{ defaultTenantId: 'tenant-default' }
		)

		expect(configs).toEqual([
			{
				tenantId: 'tenant-bom',
				organizationId: GLOBAL_ORGANIZATION_SCOPE,
				scopeKey: 'tenant:tenant-bom:global',
				plugins: [
					{
						name: '@xpert-ai/plugin-bom@1.0.0',
						version: '1.0.0',
						source: 'marketplace',
						sourceConfig: null,
						level: 'tenant'
					}
				],
				configs: { '@xpert-ai/plugin-bom': {} }
			}
		])
	})

	it('backfills explicit scope keys before restoring from the upgraded plugin_instance table', async () => {
		mockHasTable.mockResolvedValue(true)
		mockHasColumn.mockResolvedValue(true)
		mockQuery.mockResolvedValue([])

		await expect(loadPluginInstances({ defaultTenantId: 'tenant-default' })).resolves.toEqual([])

		expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('ROW_NUMBER() OVER'), ['system'])
		expect(mockQuery).toHaveBeenNthCalledWith(
			2,
			expect.stringContaining('SET "scopeKey" = $1, "tenantId" = NULL, "organizationId" = NULL'),
			[SYSTEM_GLOBAL_SCOPE, 'system']
		)
		expect(mockQuery).toHaveBeenNthCalledWith(
			3,
			expect.stringContaining("CONCAT('tenant:', \"tenantId\", ':global')"),
			[GLOBAL_ORGANIZATION_SCOPE, 'tenant-default', 'system']
		)
		expect(mockQuery.mock.calls[2][0]).toContain('"organizationId"::text')
		expect(mockQuery.mock.calls[2][0]).toContain('"tenantId"::text <> $2::text')
		expect(mockQuery.mock.calls[2][0]).not.toContain('"organizationId" <> \'\'')
		expect(mockQuery).toHaveBeenLastCalledWith(expect.stringContaining('SELECT "tenantId"'))
	})

	it('uses a null scopeKey select when restoring from an old plugin_instance table', async () => {
		mockHasTable.mockResolvedValue(true)
		mockHasColumn.mockResolvedValue(false)
		mockQuery.mockResolvedValue([])

		await expect(loadPluginInstances()).resolves.toEqual([])

		expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('NULL AS "scopeKey"'))
		expect(mockQuery).toHaveBeenCalledTimes(1)
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
