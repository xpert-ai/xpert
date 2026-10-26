import type { IPluginConfig } from '@xpert-ai/server-common'

/** Normalize deployment settings once, before worker decorators and module roles are constructed. */
export function readManagedQueueConfig(environment: NodeJS.ProcessEnv): IPluginConfig['managedQueueOptions'] {
  const positive = (value: string | undefined, fallback: number) => {
    const number = Number(value)
    return Number.isFinite(number) && number >= 1 ? Math.trunc(number) : fallback
  }
  const prefix = environment.MANAGED_QUEUE_PREFIX?.trim() || 'xpert:managed-queue'
  if (prefix.length > 160 || !/^[a-zA-Z0-9:_-]+$/.test(prefix)) throw new Error('Invalid MANAGED_QUEUE_PREFIX')
  return {
    concurrency: positive(environment.MANAGED_QUEUE_CONCURRENCY, 10),
    sandboxBrowserConcurrency: positive(environment.MANAGED_QUEUE_SANDBOX_BROWSER_CONCURRENCY, 1),
    autorun: environment.MANAGED_QUEUE_AUTORUN?.trim().toLowerCase() !== 'false',
    prefix
  }
}
