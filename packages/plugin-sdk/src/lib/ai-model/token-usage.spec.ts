import { normalizeTokenUsage, resolveTokenUsageCandidates } from './token-usage'

describe('shared token authority', () => {
  it('selects canonical actual counts before other candidates without mixing estimates', () => {
    expect(
      resolveTokenUsageCandidates({
        canonical: { promptTokens: 12 },
        actual: { totalTokens: 40 },
        estimated: { promptTokens: 99, completionTokens: 30 }
      })
    ).toEqual({ usage: { promptTokens: 12, completionTokens: 0, totalTokens: 12 }, source: 'provider' })
  })
  it.each([0, -1, NaN, Infinity])('falls through invalid actual total %s', (totalTokens) => {
    expect(
      resolveTokenUsageCandidates({ actual: { totalTokens }, estimated: { totalTokens: 7 }, legacyTotal: 99 })
    ).toMatchObject({ usage: { totalTokens: 7 }, source: 'estimated' })
  })
  it('uses legacy totals only after estimates', () => {
    expect(resolveTokenUsageCandidates({ legacyTotal: 9 })).toMatchObject({
      source: 'legacy',
      usage: { totalTokens: 9 }
    })
    expect(resolveTokenUsageCandidates({})).toMatchObject({ source: 'unavailable' })
  })
  it('preserves a positive provider total and subset details', () => {
    expect(
      normalizeTokenUsage({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 16,
        cacheReadInputTokens: 3,
        cacheWriteInputTokens: 2,
        reasoningTokens: 4
      })
    ).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 16,
      cacheReadInputTokens: 3,
      cacheWriteInputTokens: 2,
      reasoningTokens: 4
    })
    expect(normalizeTokenUsage({ promptTokens: 10, completionTokens: 5, totalTokens: 0 })?.totalTokens).toBe(15)
  })
  it('rejects invalid subset counts and overflowing totals', () => {
    expect(normalizeTokenUsage({ totalTokens: 10, reasoningTokens: -1 })).toBeNull()
    expect(normalizeTokenUsage({ promptTokens: 10, completionTokens: 5, totalTokens: 14 })).toBeNull()
    expect(normalizeTokenUsage({ promptTokens: 10, completionTokens: 5, cacheReadInputTokens: 11 })).toBeNull()
    expect(normalizeTokenUsage({ promptTokens: 10, completionTokens: 5, reasoningTokens: 6 })).toBeNull()
    expect(normalizeTokenUsage({ promptTokens: Number.MAX_SAFE_INTEGER, completionTokens: 1 })).toBeNull()
  })
})
