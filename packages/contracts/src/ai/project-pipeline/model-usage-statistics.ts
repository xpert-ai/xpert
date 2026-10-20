import { z } from 'zod/v3'

const count = z.number().int().nonnegative()
const tokens = z.number().int().nonnegative().safe()
export const pipelineModelUsageStatisticsSchema = z
  .object({
    scope: z.literal('linked_native_llm_calls'),
    requestedExecutions: count,
    executionsWithRecords: count,
    truncated: z.boolean(),
    rejectedRecords: count,
    calls: count,
    inputTokens: count.nullable(),
    outputTokens: count.nullable(),
    totalTokens: count.nullable(),
    unpricedCalls: count,
    costs: z.array(z.object({ currency: z.string(), amount: z.number().nonnegative(), calls: count }).strict()),
    byModel: z.array(
      z
        .object({
          provider: z.string(),
          model: z.string(),
          calls: count,
          inputTokens: count.nullable(),
          outputTokens: count.nullable(),
          totalTokens: count.nullable()
        })
        .strict()
    )
  })
  .strict()
export type PipelineModelUsageStatistics = z.output<typeof pipelineModelUsageStatisticsSchema>

/** Parsed ledger facts only. Request/metric identity is independent of task and parent execution links. */
export const pipelineModelUsageFactSchema = z.object({
  originExecutionId: z.string(),
  providerScopeId: z.string(),
  requestId: z.string(),
  metricKey: z.string(),
  revision: count,
  provider: z.string(),
  model: z.string(),
  promptTokens: tokens.nullable(),
  completionTokens: tokens.nullable(),
  totalTokens: tokens.nullable(),
  pricingStatus: z.enum(['priced', 'free', 'unpriced']),
  priceCurrency: z.string().nullable(),
  priceAmount: z.number().nonnegative().nullable()
})
export type PipelineModelUsageFact = z.output<typeof pipelineModelUsageFactSchema>

export function pipelineModelUsageStatistics(
  facts: readonly PipelineModelUsageFact[],
  coverage: Pick<
    PipelineModelUsageStatistics,
    'requestedExecutions' | 'executionsWithRecords' | 'truncated' | 'rejectedRecords'
  >
): PipelineModelUsageStatistics {
  const distinct = new Map<string, PipelineModelUsageFact>()
  for (const fact of facts) {
    const key = JSON.stringify([fact.providerScopeId, fact.requestId, fact.metricKey])
    if ((distinct.get(key)?.revision ?? -1) < fact.revision) distinct.set(key, fact)
  }
  const calls = [...distinct.values()]
  const totals = (items: readonly PipelineModelUsageFact[]) => {
    const sum = (field: 'promptTokens' | 'completionTokens' | 'totalTokens') => {
      if (!items.length || items.some((item) => item[field] === null)) return null
      const value = items.reduce((sum, item) => sum + item[field]!, 0)
      return Number.isSafeInteger(value) ? value : null
    }
    return {
      calls: items.length,
      inputTokens: sum('promptTokens'),
      outputTokens: sum('completionTokens'),
      totalTokens: sum('totalTokens')
    }
  }
  const costs = new Map<string, { currency: string; amount: number; calls: number }>()
  let unpricedCalls = 0
  for (const call of calls) {
    if (call.pricingStatus === 'unpriced' || !call.priceCurrency || call.priceAmount === null) {
      unpricedCalls++
      continue
    }
    const group = costs.get(call.priceCurrency) ?? { currency: call.priceCurrency, amount: 0, calls: 0 }
    group.amount += call.priceAmount
    group.calls++
    costs.set(call.priceCurrency, group)
  }
  const models = new Map<string, PipelineModelUsageFact[]>()
  for (const call of calls) {
    const key = JSON.stringify([call.provider, call.model]),
      group = models.get(key) ?? []
    group.push(call)
    models.set(key, group)
  }
  return {
    scope: 'linked_native_llm_calls',
    ...coverage,
    ...totals(calls),
    unpricedCalls,
    costs: [...costs.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    byModel: [...models.values()].map((group) => ({
      provider: group[0].provider,
      model: group[0].model,
      ...totals(group)
    }))
  }
}
