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
 * In multi-instance deployments, one schema-sync job owns startup DDL. The API
 * initializes with TypeORM synchronization disabled, then restores the configured
 * flag so runtime-installed plugin entities keep their existing synchronization behavior.
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
	dataSource.setOptions({ synchronize: options.synchronize })
	return dataSource
}
