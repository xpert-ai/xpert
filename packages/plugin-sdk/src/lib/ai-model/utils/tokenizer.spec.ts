import { countTextTokens, countTokensSafe } from './tokenizer'

describe('exact text token counting', () => {
  it('uses cl100k_base and encodes special-token spellings as ordinary document content', () => {
    expect(countTextTokens('')).toBe(0)
    expect(countTextTokens('hello world')).toBe(2)
    expect(countTextTokens('<|endoftext|>')).toBe(7)
    expect(countTextTokens('🧑')).toBeGreaterThan(1)
  })
})

describe('countTokensSafe', () => {
  it('returns a real token count instead of silently reporting zero', () => {
    expect(countTokensSafe('BOM item 84350022-01A-R')).toBeGreaterThan(0)
  })

  it('falls back for provider-specific model names', () => {
    expect(countTokensSafe('电机技术通知单 24J0708AN839', { model: 'text-embedding-v4' })).toBeGreaterThan(0)
  })
})
