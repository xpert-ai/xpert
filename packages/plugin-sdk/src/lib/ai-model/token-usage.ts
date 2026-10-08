import type { TTokenUsage } from '@xpert-ai/contracts'

export interface ResolvedTokenUsage {
  usage: TTokenUsage
  source: 'provider' | 'estimated' | 'legacy' | 'unavailable'
}

/** Select a whole candidate. Never fill missing actual counts using estimates. */
export function resolveTokenUsageCandidates(input: {
  canonical?: Partial<TTokenUsage> | null
  actual?: Partial<TTokenUsage> | null
  estimated?: Partial<TTokenUsage> | null
  legacyTotal?: number
}): ResolvedTokenUsage {
  const candidates = [
    { value: input.canonical, source: 'provider' as const },
    { value: input.actual, source: 'provider' as const },
    { value: input.estimated, source: 'estimated' as const },
    { value: { totalTokens: input.legacyTotal }, source: 'legacy' as const }
  ]
  for (const candidate of candidates) {
    const usage = normalizeTokenUsage(candidate.value)
    if (usage) return { usage, source: candidate.source }
  }
  return { usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, source: 'unavailable' }
}

export function normalizeTokenUsage(candidate?: Partial<TTokenUsage> | null): TTokenUsage | null {
  if (!candidate) return null
  const counts = [
    candidate.promptTokens,
    candidate.completionTokens,
    candidate.totalTokens,
    candidate.cacheReadInputTokens,
    candidate.cacheWriteInputTokens,
    candidate.reasoningTokens
  ]
  if (counts.some((count) => count !== undefined && (!Number.isSafeInteger(count) || count < 0))) return null
  const promptTokens = candidate.promptTokens ?? 0
  const completionTokens = candidate.completionTokens ?? 0
  const totalTokens = candidate.totalTokens || promptTokens + completionTokens
  if (!Number.isSafeInteger(totalTokens) || totalTokens <= 0 || totalTokens < promptTokens + completionTokens)
    return null
  if (
    (candidate.cacheReadInputTokens ?? 0) + (candidate.cacheWriteInputTokens ?? 0) > promptTokens ||
    (candidate.reasoningTokens ?? 0) > completionTokens
  )
    return null
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    ...(candidate.cacheReadInputTokens ? { cacheReadInputTokens: candidate.cacheReadInputTokens } : {}),
    ...(candidate.cacheWriteInputTokens ? { cacheWriteInputTokens: candidate.cacheWriteInputTokens } : {}),
    ...(candidate.reasoningTokens ? { reasoningTokens: candidate.reasoningTokens } : {})
  }
}
