import { Test } from '@nestjs/testing'
import { getEntityManagerToken, getRepositoryToken } from '@nestjs/typeorm'
import { DataSourceProtocolEnum, DataSourceSyntaxEnum } from '@xpert-ai/contracts'
import { DataSourceStrategyRegistry, DBQueryRunner } from '@xpert-ai/plugin-sdk'
import { TenantCreatedEvent } from '@xpert-ai/server-core'
import { DataSourceType } from './data-source-type.entity'
import { DataSourceTypeService } from './data-source-type.service'

jest.mock('@xpert-ai/adapter', () => {
	class BuiltinRunner {
		readonly name = 'Builtin'
		readonly type = 'builtin'
		readonly syntax = 'sql'
		readonly protocol = 'sql'
		readonly configurationSchema = {}
	}

	return {
		QUERY_RUNNERS: {
			builtin: BuiltinRunner
		}
	}
})

jest.mock('@xpert-ai/plugin-sdk', () => ({
	DataSourceStrategyRegistry: class DataSourceStrategyRegistry {}
}))

jest.mock('@xpert-ai/server-core', () => {
	class TenantBaseEntity {
		id?: string
		tenantId?: string
	}

	class Tenant {
		id?: string
	}

	class TenantCreatedEvent {
		constructor(
			public readonly tenantId: string,
			public readonly tenantName: string
		) {}
	}

	class TenantAwareCrudService<T> {
		protected readonly repository: {
			create: (entity: Partial<T>) => Partial<T>
			save: (entity: Partial<T>) => Promise<Partial<T>>
			update?: (id: string, entity: Partial<T>) => Promise<unknown>
		}

		constructor(repository: {
			create: (entity: Partial<T>) => Partial<T>
			save: (entity: Partial<T>) => Promise<Partial<T>>
			update?: (id: string, entity: Partial<T>) => Promise<unknown>
		}) {
			this.repository = repository
		}

		async create(entity: Partial<T>) {
			return this.repository.save(this.repository.create(entity))
		}

		async update(id: string, entity: Partial<T>) {
			return this.repository.update?.(id, entity)
		}
	}

	return {
		RequestContext: {
			currentTenantId: jest.fn(() => 'tenant-1')
		},
		Tenant,
		TenantAwareCrudService,
		TenantBaseEntity,
		TenantCreatedEvent
	}
})

jest.mock('./data-source-type.entity', () => ({
	DataSourceType: class DataSourceType {}
}))

class PluginMySQLRunner {
	readonly name = 'MySQL'
	readonly type = 'mysql'
	readonly syntax = DataSourceSyntaxEnum.SQL
	readonly protocol = DataSourceProtocolEnum.SQL
	readonly configurationSchema = {
		type: 'object',
		properties: {
			host: { type: 'string' }
		}
	}
}

describe('DataSourceTypeService', () => {
	const savedDataSourceTypes: Array<Partial<DataSourceType>> = []
	const repository = {
		findOne: jest.fn(),
		create: jest.fn((entity: Partial<DataSourceType>) => entity),
		save: jest.fn(async (entity: Partial<DataSourceType>) => {
			savedDataSourceTypes.push(entity)
			return entity
		}),
		update: jest.fn()
	}
	const entityManager = {
		find: jest.fn()
	}
	const pluginStrategy = {
		type: 'mysql',
		name: 'MySQL Data Source',
		create: jest.fn(),
		getClassType: jest.fn(() => PluginMySQLRunner)
	}
	const dataSourceStrategyRegistry = {
		list: jest.fn(() => [pluginStrategy])
	}

	let service: DataSourceTypeService

	beforeEach(async () => {
		jest.clearAllMocks()
		savedDataSourceTypes.length = 0
		repository.findOne.mockResolvedValue(null)
		entityManager.find.mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }])

		const testingModule = await Test.createTestingModule({
			providers: [
				DataSourceTypeService,
				{
					provide: getRepositoryToken(DataSourceType),
					useValue: repository
				},
				{
					provide: getEntityManagerToken(),
					useValue: entityManager
				},
				{
					provide: DataSourceStrategyRegistry,
					useValue: dataSourceStrategyRegistry
				}
			]
		}).compile()

		service = testingModule.get(DataSourceTypeService)
		service.log = jest.fn()
	})

	it('syncs plugin datasource strategies when a tenant is created', async () => {
		await service.handleTenantCreatedEvent(new TenantCreatedEvent('tenant-1', 'Tenant 1'))

		expect(savedDataSourceTypes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					tenantId: 'tenant-1',
					name: 'MySQL',
					type: 'mysql',
					protocol: DataSourceProtocolEnum.SQL,
					syntax: DataSourceSyntaxEnum.SQL
				})
			])
		)
	})

	it('syncs plugin datasource strategies for existing tenants', async () => {
		await service.syncAllTenants()

		expect(savedDataSourceTypes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					tenantId: 'tenant-1',
					name: 'MySQL',
					type: 'mysql'
				}),
				expect.objectContaining({
					tenantId: 'tenant-2',
					name: 'MySQL',
					type: 'mysql'
				})
			])
		)
	})

	it('does not update an existing datasource type when configuration is unchanged', async () => {
		const configuration = {
			type: 'object',
			properties: {
				host: { type: 'string' }
			}
		}
		repository.findOne.mockResolvedValue({
			id: 'datasource-type-1',
			configuration
		})

		await service.upsertDataSourceType('tenant-1', new PluginMySQLRunner() as unknown as DBQueryRunner)

		expect(repository.update).not.toHaveBeenCalled()
	})

	it('updates an existing datasource type when configuration changes', async () => {
		repository.findOne.mockResolvedValue({
			id: 'datasource-type-1',
			configuration: {
				type: 'object',
				properties: {}
			}
		})

		await service.upsertDataSourceType('tenant-1', new PluginMySQLRunner() as unknown as DBQueryRunner)

		expect(repository.update).toHaveBeenCalledWith('datasource-type-1', {
			configuration: {
				type: 'object',
				properties: {
					host: { type: 'string' }
				}
			}
		})
	})
})
