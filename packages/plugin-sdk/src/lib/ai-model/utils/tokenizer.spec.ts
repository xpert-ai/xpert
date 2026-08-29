import { countTokensSafe } from './tokenizer'

describe('countTokensSafe', () => {
  it('returns a real token count instead of silently reporting zero', () => {
    expect(countTokensSafe('BOM item 84350022-01A-R')).toBeGreaterThan(0)
  })

  it('falls back for provider-specific model names', () => {
    expect(countTokensSafe('电机技术通知单 24J0708AN839', { model: 'text-embedding-v4' })).toBeGreaterThan(0)
  })
})
