import { getConfig, setConfig } from '@xpert-ai/server-config'

/** Keeps plugin discovery from opening a startup connection that can run DDL. */
export async function withSchemaSyncProtection<T>(callback: () => Promise<T>): Promise<T> {
  const connection = getConfig().dbConnectionOptions
  const { synchronize, migrationsRun, dropSchema, type } = connection
  const installExtensions = connection.type === 'postgres' ? connection.installExtensions : undefined
  setConfig({
    dbConnectionOptions: {
      synchronize: false,
      migrationsRun: false,
      dropSchema: false,
      ...(type === 'postgres' ? { installExtensions: false } : {})
    }
  })
  try {
    return await callback()
  } finally {
    setConfig({
      dbConnectionOptions: {
        synchronize,
        migrationsRun,
        dropSchema,
        ...(type === 'postgres' ? { installExtensions } : {})
      }
    })
  }
}
