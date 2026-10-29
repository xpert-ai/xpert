import { normalizeXpertAgentConfig, type TXpertAgentConfig } from './xpert.model'

describe('Assistant execution defaults', () => {
  it('keeps deprecated concurrency source-compatible while silently ignoring it', () => {
    const config: TXpertAgentConfig = { maxConcurrency: 1, recursionLimit: 40 }
    expect(normalizeXpertAgentConfig(config)).toEqual({ recursionLimit: 40 })
    expect(config.maxConcurrency).toBe(1)
  })

  it.each([undefined, null, {}, { maxConcurrency: null }])('omits unsupported concurrency: %j', (config) => {
    expect(normalizeXpertAgentConfig(config)).toEqual({ recursionLimit: 1000 })
  })

  it.each([1, 2, 8, 50, '1'])(
    'removes legacy concurrency %s and preserves other execution settings',
    (maxConcurrency) => {
      const config = { maxConcurrency, recursionLimit: 40, interruptBefore: ['write'], timeout: 120000 }
      expect(normalizeXpertAgentConfig(config)).toEqual({
        recursionLimit: 40,
        interruptBefore: ['write'],
        timeout: 120000
      })
      expect(config.maxConcurrency).toBe(maxConcurrency)
    }
  )
})
