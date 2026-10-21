import { Test, type TestingModule } from '@nestjs/testing'
import { QueryBus } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { INTEGRATION_PERMISSION_SERVICE_TOKEN, IntegrationStrategyRegistry } from '@xpert-ai/plugin-sdk'
import { Integration } from '../../integration/integration.entity'
import { IntegrationService } from '../../integration/integration.service'
import { UserService } from '../../user'
import { assertPermissionForToken } from './index'
import { ModuleRef } from '@nestjs/core'
import {
	getDefaultTenantId,
	setDefaultTenantId,
	SYSTEM_GLOBAL_SCOPE,
	GLOBAL_ORGANIZATION_SCOPE,
	RequestContext,
	type Permissions
} from '@xpert-ai/plugin-sdk'
import { In, IsNull } from 'typeorm'
import { createPluginContext } from '../lifecycle'
import type { PluginPermissionScope } from './integration-configuration'
import { PluginIntegrationPermissionService } from './integration-permission'

describe('Built-in integration read capability', () => {
	it('keeps legacy exact runtime reads compatible without CQRS dispatch', async () => {
		const application = Object.assign(new Integration(), {
			id: 'configured-app',
			provider: 'github',
			tenantId: 'configuration-tenant',
			organizationId: null
		})
		const repository = { findOne: jest.fn().mockResolvedValue(application) }
		const queries = { execute: jest.fn().mockRejectedValue(new Error('CQRS must not be used for this read')) }
		const module = await Test.createTestingModule({
			providers: [
				IntegrationService,
				PluginIntegrationPermissionService,
				{ provide: getRepositoryToken(Integration), useValue: repository },
				{ provide: IntegrationStrategyRegistry, useValue: {} },
				{ provide: UserService, useValue: {} },
				{ provide: QueryBus, useValue: queries }
			]
		}).compile()
		await module.init()
		try {
			const capability = module.get(PluginIntegrationPermissionService)
			await expect(capability.read('configured-app')).resolves.toBe(application)
			expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 'configured-app' } })
			repository.findOne.mockResolvedValueOnce(null)
			await expect(capability.read('deleted-app')).resolves.toBeNull()
			expect(repository.findOne).toHaveBeenLastCalledWith({ where: { id: 'deleted-app' } })
			expect(queries.execute).not.toHaveBeenCalled()
		} finally {
			await module.close()
		}
	})

	it('requires the plugin to declare integration permission before resolving the built-in capability', () => {
		expect(() => assertPermissionForToken('code-review', INTEGRATION_PERMISSION_SERVICE_TOKEN, new Set())).toThrow(
			"without declaring 'integration' permission"
		)
		expect(() =>
			assertPermissionForToken('code-review', INTEGRATION_PERMISSION_SERVICE_TOKEN, new Set(['integration']))
		).not.toThrow()
	})
})

describe('host-bound integration configuration reads', () => {
	const grants: Permissions = [{ type: 'integration', service: 'github', operations: ['read'] }]
	const row = { id: 'configured-app', provider: 'github', tenantId: 'default-tenant', organizationId: null }
	const repository = { findOne: jest.fn() }
	let module: TestingModule
	let defaultTenant: string | null
	beforeEach(async () => {
		defaultTenant = getDefaultTenantId()
		setDefaultTenantId('default-tenant')
		repository.findOne.mockReset().mockResolvedValue(row)
		module = await Test.createTestingModule({
			providers: [
				PluginIntegrationPermissionService,
				IntegrationService,
				{ provide: IntegrationStrategyRegistry, useValue: {} },
				{ provide: UserService, useValue: {} },
				{ provide: INTEGRATION_PERMISSION_SERVICE_TOKEN, useExisting: PluginIntegrationPermissionService },
				{ provide: getRepositoryToken(Integration), useValue: repository },
				{
					provide: QueryBus,
					useValue: {
						execute: jest.fn(() => {
							throw new Error('Unexpected CQRS dispatch')
						})
					}
				}
			]
		}).compile()
		await module.init()
	})
	afterEach(async () => {
		await module?.close()
		setDefaultTenantId(defaultTenant)
		jest.restoreAllMocks()
	})
	function context(scope: PluginPermissionScope = { scopeKey: SYSTEM_GLOBAL_SCOPE }, permissions = grants) {
		return createPluginContext(module.get(ModuleRef), 'test-plugin', {}, permissions, scope)
	}
	function reader(scope?: PluginPermissionScope, permissions?: Permissions) {
		return context(scope, permissions).resolve<PluginIntegrationPermissionService>(
			INTEGRATION_PERMISSION_SERVICE_TOKEN
		)
	}
	function tenantWhere(tenantId: string) {
		return { id: row.id, tenantId, provider: In(['github']), organizationId: IsNull() }
	}
	it('preserves legacy runtime reads and relation options through the same bound capability', async () => {
		const service = reader()
		const legacy = { ...row, tenantId: 'another-tenant', organizationId: 'another-org' }
		repository.findOne.mockResolvedValue(legacy)
		await expect(service.read(row.id, { relations: ['tenant'] })).resolves.toEqual(legacy)
		expect(repository.findOne).toHaveBeenCalledWith({ where: { id: row.id }, relations: ['tenant'] })
		await expect(service.readConfiguration(row.id)).resolves.toBeNull()
	})
	it('uses the Default tenant without reading request context or exposing storage metadata', async () => {
		jest.spyOn(RequestContext, 'getScope').mockImplementation(() => {
			throw new Error('No request context')
		})
		const plugin = context()
		expect(plugin.tenantId).toBeNull()
		expect(plugin).not.toHaveProperty('configurationTenantId')
		await expect(
			plugin
				.resolve<PluginIntegrationPermissionService>(INTEGRATION_PERMISSION_SERVICE_TOKEN)
				.readConfiguration(row.id)
		).resolves.toEqual(row)
		expect(repository.findOne).toHaveBeenCalledWith({ where: [tenantWhere('default-tenant')] })
	})
	it.each([null, ''])('fails closed when the Default tenant is unavailable: %s', async (id) => {
		setDefaultTenantId(id)
		await expect(
			reader({ scopeKey: SYSTEM_GLOBAL_SCOPE, tenantId: 'untrusted-fallback' }).readConfiguration(row.id)
		).resolves.toBeNull()
		expect(repository.findOne).not.toHaveBeenCalled()
	})
	it('uses the tenant plugin owner and excludes organization configurations', async () => {
		repository.findOne.mockResolvedValue({ ...row, tenantId: 'tenant' })
		await expect(
			reader({ tenantId: 'tenant', organizationId: GLOBAL_ORGANIZATION_SCOPE }).readConfiguration(row.id)
		).resolves.toMatchObject({ tenantId: 'tenant' })
		expect(repository.findOne).toHaveBeenCalledWith({ where: [tenantWhere('tenant')] })
	})
	it.each([null, 'org'])('allows organization or inherited tenant configuration: %s', async (organizationId) => {
		repository.findOne.mockResolvedValue({ ...row, tenantId: 'tenant', organizationId })
		await expect(
			reader({ tenantId: 'tenant', organizationId: 'org', scopeKey: 'org' }).readConfiguration(row.id)
		).resolves.toMatchObject({ tenantId: 'tenant', organizationId })
		expect(repository.findOne).toHaveBeenCalledWith({
			where: [tenantWhere('tenant'), { ...tenantWhere('tenant'), organizationId: 'org' }]
		})
	})
	it.each([
		{ tenantId: 'foreign' },
		{ organizationId: 'foreign-org' },
		{ organizationId: '' },
		{ provider: 'other' },
		{ id: 'different-id' }
	])('never exposes a mismatched record: %j', async (patch) => {
		repository.findOne.mockResolvedValue({ ...row, ...patch })
		await expect(reader().readConfiguration(row.id)).resolves.toBeNull()
	})
	it('rechecks deleted records and does not cache integration credentials', async () => {
		const service = reader()
		await expect(service.readConfiguration(row.id)).resolves.toEqual(row)
		repository.findOne.mockResolvedValue(null)
		await expect(service.readConfiguration(row.id)).resolves.toBeNull()
		expect(repository.findOne).toHaveBeenCalledTimes(2)
	})
	it('does not accept a tenant from context mutations, another plugin or call options', async () => {
		const scope = { tenantId: 'tenant', organizationId: null }
		const plugin = context(scope)
		scope.tenantId = 'foreign'
		plugin.tenantId = 'foreign'
		plugin.scopeKey = SYSTEM_GLOBAL_SCOPE
		const service = plugin.resolve<PluginIntegrationPermissionService>(INTEGRATION_PERMISSION_SERVICE_TOKEN)
		expect(plugin.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)).toBe(service)
		expect(reader({ tenantId: 'other' })).not.toBe(service)
		repository.findOne.mockResolvedValue({ ...row, tenantId: 'tenant' })
		await expect(service.readConfiguration(row.id, { tenantId: 'foreign' }, ['*'])).resolves.toMatchObject({
			tenantId: 'tenant'
		})
		expect(repository.findOne).toHaveBeenCalledWith({ where: [tenantWhere('tenant')] })
	})
	it.each<{ permissions: Permissions }>([
		{ permissions: [] },
		{ permissions: [{ type: 'integration', service: 'github', operations: ['write'] }] },
		{ permissions: [{ type: 'integration', service: 'github', scope: ['different-app'] }] }
	])('requires declared read access and allowed resource IDs: %j', async ({ permissions }) => {
		if (!permissions.length) expect(() => reader(undefined, permissions)).toThrow('without declaring')
		else await expect(reader(undefined, permissions).readConfiguration(row.id)).resolves.toBeNull()
		expect(repository.findOne).not.toHaveBeenCalled()
	})
	it('retains the legacy default operations and explicit wildcard service declaration', async () => {
		await expect(
			reader(undefined, [{ type: 'integration', service: '*' }]).readConfiguration(row.id)
		).resolves.toEqual(row)
		expect(repository.findOne).toHaveBeenCalledWith({
			where: [{ id: row.id, tenantId: 'default-tenant', organizationId: IsNull() }]
		})
	})
	it('rejects missing installation scope and blank IDs without a database lookup', async () => {
		await expect(reader({}).readConfiguration(row.id)).resolves.toBeNull()
		await expect(reader().readConfiguration('')).resolves.toBeNull()
		await expect(module.get(PluginIntegrationPermissionService).readConfiguration(row.id)).resolves.toBeNull()
		expect(repository.findOne).not.toHaveBeenCalled()
	})
})
