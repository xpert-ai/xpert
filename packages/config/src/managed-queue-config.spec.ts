import { readManagedQueueConfig } from './managed-queue-config'

describe('managed queue configuration boundary', () => {
  it('preserves shared defaults', () => {
    expect(readManagedQueueConfig({})).toEqual({
      concurrency: 10,
      sandboxBrowserConcurrency: 1,
      autorun: true,
      prefix: 'xpert:managed-queue'
    })
  })
  it('normalizes environment input once', () => {
    expect(
      readManagedQueueConfig({
        MANAGED_QUEUE_CONCURRENCY: '5.5',
        MANAGED_QUEUE_SANDBOX_BROWSER_CONCURRENCY: '3',
        MANAGED_QUEUE_AUTORUN: ' FALSE ',
        MANAGED_QUEUE_PREFIX: ' isolated:queue '
      })
    ).toEqual({ concurrency: 5, sandboxBrowserConcurrency: 3, autorun: false, prefix: 'isolated:queue' })
  })
  it.each(['0', '-1', '0.5', 'invalid'])('rejects invalid concurrency %s by using safe defaults', (value) => {
    expect(readManagedQueueConfig({ MANAGED_QUEUE_CONCURRENCY: value }).concurrency).toBe(10)
  })
  it.each(['bad prefix', 'a'.repeat(161)])('rejects unsafe prefixes', (prefix) => {
    expect(() => readManagedQueueConfig({ MANAGED_QUEUE_PREFIX: prefix })).toThrow('MANAGED_QUEUE_PREFIX')
  })
})
