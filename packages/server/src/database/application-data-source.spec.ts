import { DataSourceOptions } from 'typeorm'
import { initializeApplicationDataSource } from './application-data-source'

describe('initializeApplicationDataSource', () => {
	const environment = { NODE_ENV: process.env.NODE_ENV, DB_SCHEMA_SYNC_MODE: process.env.DB_SCHEMA_SYNC_MODE }
	afterEach(() => {
		for (const [key, value] of Object.entries(environment)) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	})

	it.each([
		['development', undefined],
		['development', 'internal'],
		['development', 'external'],
		['production', undefined],
		['production', 'internal'],
		['production', 'external']
	])('prevents startup DDL in %s with mode %s', async (nodeEnv, mode) => {
		process.env.NODE_ENV = nodeEnv
		if (mode === undefined) delete process.env.DB_SCHEMA_SYNC_MODE
		else process.env.DB_SCHEMA_SYNC_MODE = mode
		const configured: DataSourceOptions = {
			type: 'postgres',
			host: 'db',
			database: 'xpert',
			synchronize: true,
			migrationsRun: true,
			dropSchema: true,
			installExtensions: true
		}
		const dataSource = { initialize: jest.fn(), setOptions: jest.fn() }
		const create = jest.fn(() => dataSource)

		expect(await initializeApplicationDataSource(configured, create)).toBe(dataSource)
		expect(create).toHaveBeenCalledWith({
			...configured,
			synchronize: false,
			migrationsRun: false,
			dropSchema: false,
			installExtensions: false
		})
		expect(configured.synchronize).toBe(true)
		expect(dataSource.initialize).toHaveBeenCalledTimes(1)
	})
})
