import { DataSourceOptions } from 'typeorm'

export const EXTERNAL_SCHEMA_SYNC_MODE = 'external'

export function isSchemaSyncExternallyManaged(schemaSyncMode = process.env.DB_SCHEMA_SYNC_MODE): boolean {
	return schemaSyncMode === EXTERNAL_SCHEMA_SYNC_MODE
}

export interface InitializableApplicationDataSource {
	initialize(): Promise<unknown>
	setOptions(options: Partial<DataSourceOptions>): unknown
}

/**
 * In multi-instance deployments, one schema-sync job owns startup and plugin DDL.
 * The API keeps TypeORM synchronization disabled so loading plugin metadata never
 * starts a second, uncoordinated schema change.
 */
export async function initializeApplicationDataSource<T extends InitializableApplicationDataSource>(
	options: DataSourceOptions,
	createDataSource: (options: DataSourceOptions) => T,
	schemaSyncMode = process.env.DB_SCHEMA_SYNC_MODE
): Promise<T> {
	if (!isSchemaSyncExternallyManaged(schemaSyncMode)) {
		const dataSource = createDataSource(options)
		await dataSource.initialize()
		return dataSource
	}

	const startupOptions = {
		...options,
		synchronize: false
	} as DataSourceOptions
	const dataSource = createDataSource(startupOptions)
	await dataSource.initialize()
	return dataSource
}
