import { isSchemaSyncExternallyManaged } from '@xpert-ai/server-core'
import { getConfig, setConfig } from '@xpert-ai/server-config'

/** Keeps plugin discovery from opening a startup connection that can run DDL. */
export async function withSchemaSyncProtection<T>(callback: () => Promise<T>): Promise<T> {
  if (!isSchemaSyncExternallyManaged()) {
    return callback()
  }

  const configuredSynchronize = getConfig().dbConnectionOptions.synchronize
  setConfig({ dbConnectionOptions: { synchronize: false } })
  try {
    return await callback()
  } finally {
    setConfig({ dbConnectionOptions: { synchronize: configuredSynchronize } })
  }
}
