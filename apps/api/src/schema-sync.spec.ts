import { IPluginConfig } from '@xpert-ai/server-common'
import { DataSourceOptions } from 'typeorm'
import { runSchemaSync } from './schema-sync'

class TestSchemaSyncDataSource {
	isInitialized = false
	readonly events: string[] = []
	synchronizeError?: Error

	async initialize() {
		this.events.push('initialize')
		this.isInitialized = true
		return this
	}

	async synchronize() {
		this.events.push('synchronize')
		if (this.synchronizeError) {
			throw this.synchronizeError
		}
	}

	async destroy() {
		this.events.push('destroy')
		this.isInitialized = false
	}
}

const pluginConfig: IPluginConfig = {
	apiConfigOptions: {
		port: 3000,
		middleware: [],
		graphqlConfigOptions: {
			path: '/graphql',
			playground: false,
			debug: false
		}
	},
	dbConnectionOptions: {
		type: 'postgres',
		host: 'db',
		database: 'xpert',
		username: 'postgres',
		password: 'secret',
		synchronize: true
	}
}

describe('runSchemaSync', () => {
	it('prepares all entities and performs one explicit schema synchronization', async () => {
		let preparedConfig: Partial<IPluginConfig> | undefined
		let createdOptions: DataSourceOptions | undefined
		const dataSource = new TestSchemaSyncDataSource()

		await runSchemaSync(pluginConfig, {
			prepareConfig: async (config) => {
				preparedConfig = config
				return pluginConfig
			},
			createDataSource: (options) => {
				createdOptions = options
				return dataSource
			}
		})

		expect(preparedConfig?.dbConnectionOptions?.synchronize).toBe(false)
		expect(createdOptions?.synchronize).toBe(false)
		expect(dataSource.events).toEqual(['initialize', 'synchronize', 'destroy'])
	})

	it('closes the database connection and propagates a synchronization failure', async () => {
		const dataSource = new TestSchemaSyncDataSource()
		dataSource.synchronizeError = new Error('schema sync failed')

		await expect(
			runSchemaSync(pluginConfig, {
				prepareConfig: async () => pluginConfig,
				createDataSource: () => dataSource
			})
		).rejects.toThrow('schema sync failed')

		expect(dataSource.events).toEqual(['initialize', 'synchronize', 'destroy'])
	})
})
