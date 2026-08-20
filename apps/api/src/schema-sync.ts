import { IPluginConfig } from '@xpert-ai/server-common'
import { DataSource, DataSourceOptions } from 'typeorm'

export interface SchemaSyncDataSource {
	readonly isInitialized: boolean
	initialize(): Promise<unknown>
	synchronize(): Promise<unknown>
	destroy(): Promise<unknown>
}

export interface SchemaSyncDependencies {
	prepareConfig(config: Partial<IPluginConfig>): Promise<Readonly<IPluginConfig>>
	createDataSource(options: DataSourceOptions): SchemaSyncDataSource
}

const defaultDependencies: SchemaSyncDependencies = {
	prepareConfig: async (config) => {
		const { preBootstrapApplicationConfig } = await import('./bootstrap')
		return preBootstrapApplicationConfig(config, { failOnPluginRegistrationError: true })
	},
	createDataSource: (options) => new DataSource(options)
}

/**
 * Deployment orchestration runs this command exactly once before API replicas start.
 * Explicit synchronization is kept separate from DataSource initialization so a
 * failed DDL operation aborts deployment instead of racing with other API processes.
 */
export async function runSchemaSync(
	pluginConfig: IPluginConfig,
	dependencies: SchemaSyncDependencies = defaultDependencies
): Promise<void> {
	const config = await dependencies.prepareConfig({
		...pluginConfig,
		dbConnectionOptions: {
			...pluginConfig.dbConnectionOptions,
			synchronize: false
		}
	})
	const dataSourceOptions = {
		...config.dbConnectionOptions,
		synchronize: false
	} as DataSourceOptions
	const dataSource = dependencies.createDataSource(dataSourceOptions)

	try {
		await dataSource.initialize()
		await dataSource.synchronize()
	} finally {
		if (dataSource.isInitialized) {
			await dataSource.destroy()
		}
	}
}
