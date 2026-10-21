import { randomUUID } from 'node:crypto'
import { ModuleRef } from '@nestjs/core'
import { QueryBus } from '@nestjs/cqrs'
import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource, EntitySchema } from 'typeorm'
import {
	INTEGRATION_PERMISSION_SERVICE_TOKEN,
	SYSTEM_GLOBAL_SCOPE,
	getDefaultTenantId,
	setDefaultTenantId
} from '@xpert-ai/plugin-sdk'
import { Integration } from '../../integration/integration.entity'
import { createPluginContext } from '../lifecycle'
import { PluginIntegrationPermissionService } from './integration-permission'
import type { PluginPermissionScope } from './integration-configuration'

const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
if (url && !/^\/xpert_pipeline_test_[a-z0-9_]+$/.test(new URL(url).pathname)) {
	throw new Error('A dedicated integration test database is required')
}

;(url ? describe : describe.skip)('integration configuration PostgreSQL isolation', () => {
	const schema = `integration_read_${randomUUID().replace(/-/g, '')}`
	const defaultTenant = randomUUID(),
		otherTenant = randomUUID(),
		organization = randomUUID(),
		otherOrganization = randomUUID()
	const ids = {
		system: randomUUID(),
		otherTenant: randomUUID(),
		organization: randomUUID(),
		otherOrganization: randomUUID(),
		provider: randomUUID()
	}
	const entity = new EntitySchema<Integration>({
		name: 'IntegrationReadFixture',
		tableName: 'integration',
		columns: {
			id: { type: 'uuid', primary: true },
			tenantId: { type: 'uuid' },
			organizationId: { type: 'uuid', nullable: true },
			provider: { type: 'varchar' },
			options: { type: 'jsonb', nullable: true }
		}
	})
	let db: DataSource, module: TestingModule, previousDefault: string | null
	beforeAll(async () => {
		previousDefault = getDefaultTenantId()
		setDefaultTenantId(defaultTenant)
		db = new DataSource({ type: 'postgres', url, schema, entities: [entity], synchronize: false })
		await db.initialize()
		await db.query(`CREATE SCHEMA "${schema}"`)
		await db.synchronize()
		const repository = db.getRepository(entity)
		await repository.save([
			{ id: ids.system, tenantId: defaultTenant, organizationId: null, provider: 'github' },
			{ id: ids.otherTenant, tenantId: otherTenant, organizationId: null, provider: 'github' },
			{ id: ids.organization, tenantId: defaultTenant, organizationId: organization, provider: 'github' },
			{
				id: ids.otherOrganization,
				tenantId: defaultTenant,
				organizationId: otherOrganization,
				provider: 'github'
			},
			{ id: ids.provider, tenantId: defaultTenant, organizationId: null, provider: 'another-provider' }
		])
		module = await Test.createTestingModule({
			providers: [
				PluginIntegrationPermissionService,
				{ provide: INTEGRATION_PERMISSION_SERVICE_TOKEN, useExisting: PluginIntegrationPermissionService },
				{ provide: getRepositoryToken(Integration), useValue: repository },
				{
					provide: QueryBus,
					useValue: {
						execute: () => {
							throw new Error('No CQRS dispatch expected')
						}
					}
				}
			]
		}).compile()
		await module.init()
	}, 30000)
	afterAll(async () => {
		await module?.close()
		if (db?.isInitialized) {
			try {
				await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
			} finally {
				await db.destroy()
			}
		}
		setDefaultTenantId(previousDefault)
	})
	function reader(scope: PluginPermissionScope) {
		return createPluginContext(
			module.get(ModuleRef),
			'fixture-plugin',
			{},
			[{ type: 'integration', service: 'github', operations: ['read'] }],
			scope
		).resolve<PluginIntegrationPermissionService>(INTEGRATION_PERMISSION_SERVICE_TOKEN)
	}
	it('reads only Default-tenant configuration for a system plugin, with no request context', async () => {
		const service = reader({ scopeKey: SYSTEM_GLOBAL_SCOPE })
		await expect(service.readConfiguration(ids.system)).resolves.toMatchObject({ id: ids.system })
		for (const id of [ids.otherTenant, ids.organization, ids.otherOrganization, ids.provider, randomUUID()]) {
			await expect(service.readConfiguration(id)).resolves.toBeNull()
		}
	})
	it('limits organization plugins to their own organization and inherited tenant configuration', async () => {
		const service = reader({ tenantId: defaultTenant, organizationId: organization, scopeKey: organization })
		for (const id of [ids.system, ids.organization]) {
			await expect(service.readConfiguration(id)).resolves.toMatchObject({ id })
		}
		for (const id of [ids.otherOrganization, ids.otherTenant, ids.provider]) {
			await expect(service.readConfiguration(id)).resolves.toBeNull()
		}
	})
	it('uses each tenant plugin owner without falling back to Default-tenant configuration', async () => {
		const service = reader({ tenantId: otherTenant })
		await expect(service.readConfiguration(ids.otherTenant)).resolves.toMatchObject({ id: ids.otherTenant })
		await expect(service.readConfiguration(ids.system)).resolves.toBeNull()
	})
})
