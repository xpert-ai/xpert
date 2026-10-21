import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AnalyticsProviderRegistry, DataSourceStrategyRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource } from '../data-source/data-source.entity'
import { DataSourceType } from '../data-source-type/data-source-type.entity'
import { DataSourceTypeService } from '../data-source-type/data-source-type.service'
import { DatabaseAnalyticsSourceResolver } from './analytics-database.resolver'
const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'viewer' }
class Driver {
	type = 'postgres'
}
describe('database source classification', () => {
	const findTypes = jest.fn(),
		findSource = jest.fn(),
		providers = jest.fn()
	let types: DataSourceTypeService, resolver: DatabaseAnalyticsSourceResolver
	beforeEach(async () => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
		jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
		jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
		providers.mockReturnValue([
			{ descriptor: { id: 'postgres.sql', sourceKinds: ['data-source'], dataSourceTypes: ['postgres'] } },
			{ descriptor: { id: 'file.table', sourceKinds: ['definition'] } }
		])
		findTypes.mockResolvedValue([{ type: 'postgres' }])
		findSource.mockResolvedValue({ id: 'db', typeId: 'type', type: { type: 'postgres' }, updatedAt: new Date(0) })
		const module = await Test.createTestingModule({
			providers: [
				DataSourceTypeService,
				DatabaseAnalyticsSourceResolver,
				{ provide: getRepositoryToken(DataSourceType), useValue: { find: findTypes } },
				{ provide: getRepositoryToken(DataSource), useValue: { findOne: findSource } },
				{ provide: DataSourceStrategyRegistry, useValue: { list: () => [{ getClassType: () => Driver }] } },
				{ provide: AnalyticsProviderRegistry, useValue: { list: providers } }
			]
		}).compile()
		types = module.get(DataSourceTypeService)
		resolver = module.get(DatabaseAnalyticsSourceResolver)
	})
	afterEach(() => jest.restoreAllMocks())
	it('lists only registered driver identifiers without adding Analytics definitions', async () => {
		expect((await types.available()).items).toEqual([{ type: 'postgres' }])
		expect(findTypes.mock.calls.at(-1)[0].where.type.value).toEqual(['postgres'])
	})
	it('enforces scoped database permissions and post-query type/version checks', async () => {
		const source = { kind: 'data-source' as const, dataSourceId: 'db' },
			resolved = await resolver.resolve(actor, source)
		expect(resolved.providerIds).toEqual(['postgres.sql'])
		expect(resolved.options).toEqual({})
		expect(findSource).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 'db', tenantId: 'tenant', organizationId: 'org' } })
		)
		findSource.mockResolvedValue({ id: 'db', type: { type: 'workspace-files' } })
		await expect(resolved.revalidate()).rejects.toThrow()
		jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
		expect(await resolver.list(actor)).toEqual([])
		await expect(resolver.resolve(actor, source)).rejects.toThrow()
	})
})
