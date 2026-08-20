import { DataSourceOptions } from 'typeorm'
import { initializeApplicationDataSource, isSchemaSyncExternallyManaged } from './application-data-source'

class TestDataSource {
	readonly events: string[] = []
	readonly optionUpdates: Array<Partial<DataSourceOptions>> = []

	async initialize() {
		this.events.push('initialize')
		return this
	}

	setOptions(options: Partial<DataSourceOptions>) {
		this.events.push('setOptions')
		this.optionUpdates.push(options)
		return this
	}
}

const configuredOptions: DataSourceOptions = {
	type: 'postgres',
	host: 'db',
	database: 'xpert',
	username: 'postgres',
	password: 'secret',
	synchronize: true
}

describe('initializeApplicationDataSource', () => {
	it('only enables external ownership for the explicit external mode', () => {
		expect(isSchemaSyncExternallyManaged('external')).toBe(true)
		expect(isSchemaSyncExternallyManaged(undefined)).toBe(false)
		expect(isSchemaSyncExternallyManaged('internal')).toBe(false)
	})

	it('skips startup synchronization in external mode and restores runtime plugin synchronization', async () => {
		let createdOptions: DataSourceOptions | undefined
		const dataSource = new TestDataSource()

		const result = await initializeApplicationDataSource(
			configuredOptions,
			(options) => {
				createdOptions = options
				return dataSource
			},
			'external'
		)

		expect(result).toBe(dataSource)
		expect(createdOptions?.synchronize).toBe(false)
		expect(dataSource.events).toEqual(['initialize', 'setOptions'])
		expect(dataSource.optionUpdates).toEqual([{ synchronize: true }])
	})

	it('keeps the configured TypeORM behavior outside external mode', async () => {
		let createdOptions: DataSourceOptions | undefined
		const dataSource = new TestDataSource()

		await initializeApplicationDataSource(
			configuredOptions,
			(options) => {
				createdOptions = options
				return dataSource
			},
			undefined
		)

		expect(createdOptions?.synchronize).toBe(true)
		expect(dataSource.events).toEqual(['initialize'])
		expect(dataSource.optionUpdates).toEqual([])
	})
})
