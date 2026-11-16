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
  it('isolates development queues by the API listener port by default', () => {
    const env = { NODE_ENV: 'development' }
    expect(readManagedQueueConfig(env).prefix).toBe('xpert:managed-queue:local:3000')
    expect(readManagedQueueConfig({ ...env, PORT: '3333' }).prefix).toBe('xpert:managed-queue:local:3333')
    expect(readManagedQueueConfig({ ...env, MANAGED_QUEUE_PREFIX_BY_PORT: ' false ' }).prefix).toBe(
      'xpert:managed-queue'
    )
    expect(readManagedQueueConfig({ ...env, MANAGED_QUEUE_PREFIX: 'shared' }).prefix).toBe('shared')
    expect(() => readManagedQueueConfig({ ...env, PORT: '70000' })).toThrow('valid PORT')
  })
  it.each(['production', 'test'])('uses a shared queue by default in %s', (mode) => {
    expect(readManagedQueueConfig({ NODE_ENV: mode, PORT: '3333' }).prefix).toBe('xpert:managed-queue')
  })
  it.each([
    { NODE_ENV: 'development', MANAGED_QUEUE_PREFIX_BY_PORT: 'ture' },
    { NODE_ENV: 'production', MANAGED_QUEUE_PREFIX_BY_PORT: '1' },
    { MANAGED_QUEUE_PREFIX: 'shared', MANAGED_QUEUE_PREFIX_BY_PORT: 'yes' }
  ])('rejects the invalid port isolation flag $MANAGED_QUEUE_PREFIX_BY_PORT', (env) => {
    expect(() => readManagedQueueConfig(env)).toThrow('MANAGED_QUEUE_PREFIX_BY_PORT must be true or false')
  })
  it('treats a blank flag as unset and accepts mixed-case booleans', () => {
    expect(readManagedQueueConfig({ NODE_ENV: 'development', MANAGED_QUEUE_PREFIX_BY_PORT: ' ' }).prefix).toBe(
      'xpert:managed-queue:local:3000'
    )
    expect(readManagedQueueConfig({ PORT: '3333', MANAGED_QUEUE_PREFIX_BY_PORT: ' True ' }).prefix).toBe(
      'xpert:managed-queue:local:3333'
    )
  })
  it('isolates local listeners sharing a dotenv file and Redis', () => {
    const env = { MANAGED_QUEUE_PREFIX_BY_PORT: 'true' }
    expect(readManagedQueueConfig({ ...env, PORT: '3333' }).prefix).toBe('xpert:managed-queue:local:3333')
    expect(readManagedQueueConfig({ ...env, PORT: '4387' }).prefix).toBe('xpert:managed-queue:local:4387')
    expect(readManagedQueueConfig({ ...env, MANAGED_QUEUE_PREFIX: 'explicit:deployment' }).prefix).toBe(
      'explicit:deployment'
    )
    expect(() => readManagedQueueConfig({ ...env, PORT: '65536' })).toThrow('valid PORT')
    expect(() => readManagedQueueConfig(env)).toThrow('valid PORT')
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
