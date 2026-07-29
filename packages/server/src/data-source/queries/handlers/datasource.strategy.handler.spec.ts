import { InternalServerErrorException } from '@nestjs/common'
import { DataSourceStrategyQuery } from '../datasource.strategy.query'
import { DataSourceStrategyHandler } from './datasource.strategy.handler'

describe('DataSourceStrategyHandler', () => {
	const options = {
		host: 'localhost',
		port: 5432,
		username: 'user',
		password: 'password'
	}

	function createHandler() {
		const strategy = {
			create: jest.fn()
		}
		const registry = {
			get: jest.fn().mockReturnValue(strategy)
		}
		const handler = new DataSourceStrategyHandler()
		Reflect.set(handler, 'dataSourceStrategyRegistry', registry)

		return {
			handler,
			registry,
			strategy
		}
	}

	it('creates runners exclusively through the registered plugin strategy', async () => {
		const { handler, registry, strategy } = createHandler()
		const runner = { teardown: jest.fn() }
		strategy.create.mockResolvedValue(runner)

		const result = await handler.execute(new DataSourceStrategyQuery('postgres', options, 'data-source-1'))

		expect(registry.get).toHaveBeenCalledWith('postgres')
		expect(strategy.create).toHaveBeenCalledWith(options, 'data-source-1')
		expect(result).toBe(runner)
	})

	it('reports a missing plugin strategy without trying a legacy fallback', async () => {
		const { handler, registry, strategy } = createHandler()
		registry.get.mockImplementation(() => {
			throw new Error('not registered')
		})

		await expect(handler.execute(new DataSourceStrategyQuery('missing', options))).rejects.toEqual(
			new InternalServerErrorException('DataSource strategy not found for type: missing')
		)
		expect(strategy.create).not.toHaveBeenCalled()
	})

	it('preserves errors raised while the plugin creates its runner', async () => {
		const { handler, strategy } = createHandler()
		const error = new Error('connection configuration is invalid')
		strategy.create.mockRejectedValue(error)

		await expect(handler.execute(new DataSourceStrategyQuery('postgres', options))).rejects.toBe(error)
	})
})
