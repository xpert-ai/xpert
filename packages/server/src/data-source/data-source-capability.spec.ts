import { DataSourceType } from '../data-source-type/data-source-type.entity'
import { DataSource } from './data-source.entity'
import { DataSourceService } from './data-source.service'

function createService(execute: jest.Mock): DataSourceService {
	const service: DataSourceService = Object.create(DataSourceService.prototype)
	Object.defineProperty(service, 'queryBus', { value: { execute } })

	const dataSource = new DataSource()
	const type = new DataSourceType()
	type.type = 'sapbw'
	dataSource.type = type
	dataSource.options = { host: 'server-side-only' }
	jest.spyOn(service, 'prepareDataSource').mockResolvedValue(dataSource)
	return service
}

describe('DataSourceService capability query', () => {
	it('delegates an adapter-owned read query and always tears down the runner', async () => {
		const queryCapability = jest.fn().mockResolvedValue({ catalogs: [] })
		const teardown = jest.fn().mockResolvedValue(undefined)
		const execute = jest.fn().mockResolvedValue({ queryCapability, teardown })
		const service = createService(execute)
		const query = {
			capability: 'xmla.metadata',
			operation: 'discover',
			payload: { catalog: '$BWCATALOG' }
		}

		await expect(service.queryCapability('data-source-1', query)).resolves.toEqual({ catalogs: [] })
		expect(queryCapability).toHaveBeenCalledWith(query)
		expect(teardown).toHaveBeenCalledTimes(1)
	})

	it('rejects invalid capability keys before creating a runner', async () => {
		const execute = jest.fn()
		const service = createService(execute)

		await expect(
			service.queryCapability('data-source-1', {
				capability: '../xmla',
				operation: 'discover'
			})
		).rejects.toThrow('valid data-source capability')
		expect(execute).not.toHaveBeenCalled()
	})

	it('fails closed when an adapter does not implement capability queries', async () => {
		const teardown = jest.fn().mockResolvedValue(undefined)
		const service = createService(jest.fn().mockResolvedValue({ teardown }))

		await expect(
			service.queryCapability('data-source-1', {
				capability: 'xmla.metadata',
				operation: 'discover'
			})
		).rejects.toThrow("adapter 'sapbw' does not support capability queries")
		expect(teardown).toHaveBeenCalledTimes(1)
	})
})
