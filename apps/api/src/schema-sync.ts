import { IPluginConfig } from '@xpert-ai/server-common'
import { DataSource, DataSourceOptions } from 'typeorm'
import {
  SchemaMigrationAction,
  synchronizeWithMigrations
} from '../../../packages/server/src/database/schema-migration'
import { loadSchemaMigrations } from './schema-migrations'

export interface SchemaSyncDataSource {
  readonly isInitialized: boolean
  initialize(): Promise<unknown>
  synchronize(): Promise<unknown>
  destroy(): Promise<unknown>
}

export interface SchemaSyncDependencies {
  prepareConfig(config: Partial<IPluginConfig>): Promise<Readonly<IPluginConfig>>
  createDataSource(options: DataSourceOptions): SchemaSyncDataSource
  migrate(dataSource: SchemaSyncDataSource, action: SchemaMigrationAction): Promise<void>
}

const defaultDependencies: SchemaSyncDependencies = {
  prepareConfig: async (config) => {
    const { preBootstrapApplicationConfig } = await import('./bootstrap')
    // Individual plugin failures are isolated by the loader. A failed discovery
    // group cannot supply its successful modules, so that still aborts migration.
    return preBootstrapApplicationConfig(config, { failOnPluginGroupError: true })
  },
  createDataSource: (options) => new DataSource(options),
  migrate: async (source, action) => {
    if (!(source instanceof DataSource)) throw new Error('A TypeORM DataSource is required')
    await synchronizeWithMigrations(source, await loadSchemaMigrations(), action)
  }
}

/**
 * Deployment orchestration runs this command exactly once before API replicas start.
 * Explicit synchronization is kept separate from DataSource initialization so a
 * failed DDL operation aborts deployment instead of racing with other API processes.
 */
export async function runSchemaSync(
  pluginConfig: IPluginConfig,
  dependencies: SchemaSyncDependencies = defaultDependencies,
  action: SchemaMigrationAction = 'apply'
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
    synchronize: false,
    migrationsRun: false,
    dropSchema: false,
    logging: false,
    ...(config.dbConnectionOptions.type === 'postgres' ? { installExtensions: false } : {})
  } as DataSourceOptions
  const dataSource = dependencies.createDataSource(dataSourceOptions)

  try {
    await dataSource.initialize()
    await dependencies.migrate(dataSource, action)
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy()
    }
  }
}
