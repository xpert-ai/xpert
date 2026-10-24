import { DataSourceOptions } from 'typeorm'

export interface InitializableApplicationDataSource {
	initialize(): Promise<unknown>
	setOptions(options: Partial<DataSourceOptions>): unknown
}

/**
 * The schema-sync command owns synchronization and SQL migrations in every environment.
 * The API keeps TypeORM synchronization disabled so loading plugin metadata never
 * starts a second, uncoordinated schema change.
 */
export async function initializeApplicationDataSource<T extends InitializableApplicationDataSource>(
	options: DataSourceOptions,
	createDataSource: (options: DataSourceOptions) => T
): Promise<T> {
	const startupOptions = {
		...options,
		synchronize: false,
		migrationsRun: false,
		dropSchema: false,
		...(options.type === 'postgres' ? { installExtensions: false } : {})
	} as DataSourceOptions
	const dataSource = createDataSource(startupOptions)
	await dataSource.initialize()
	return dataSource
}
