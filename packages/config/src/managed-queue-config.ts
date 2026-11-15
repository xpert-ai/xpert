import { DEFAULT_API_PORT, type IPluginConfig } from '@xpert-ai/server-common'

/** Normalize deployment settings once, before worker decorators and module roles are constructed. */
export function readManagedQueueConfig(environment: NodeJS.ProcessEnv): IPluginConfig['managedQueueOptions'] {
  const positive = (value: string | undefined, fallback: number) => {
    const number = Number(value)
    return Number.isFinite(number) && number >= 1 ? Math.trunc(number) : fallback
  }
  const byPort = environment.MANAGED_QUEUE_PREFIX_BY_PORT?.trim().toLowerCase()
  if (byPort && byPort !== 'true' && byPort !== 'false') {
    throw new Error('MANAGED_QUEUE_PREFIX_BY_PORT must be true or false')
  }
  let prefix = environment.MANAGED_QUEUE_PREFIX?.trim()
  if (!prefix) {
    prefix = 'xpert:managed-queue'
    const isDevelopment = environment.NODE_ENV === 'development'
    const isolateByPort = byPort ? byPort === 'true' : isDevelopment
    if (isolateByPort) {
      const port = environment.PORT?.trim() || (isDevelopment ? String(DEFAULT_API_PORT) : '')
      if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
        throw new Error('MANAGED_QUEUE_PREFIX_BY_PORT requires a valid PORT')
      }
      prefix += `:local:${Number(port)}`
    }
  }
  if (prefix.length > 160 || !/^[a-zA-Z0-9:_-]+$/.test(prefix)) throw new Error('Invalid MANAGED_QUEUE_PREFIX')
  return {
    concurrency: positive(environment.MANAGED_QUEUE_CONCURRENCY, 10),
    sandboxBrowserConcurrency: positive(environment.MANAGED_QUEUE_SANDBOX_BROWSER_CONCURRENCY, 1),
    autorun: environment.MANAGED_QUEUE_AUTORUN?.trim().toLowerCase() !== 'false',
    prefix
  }
}
