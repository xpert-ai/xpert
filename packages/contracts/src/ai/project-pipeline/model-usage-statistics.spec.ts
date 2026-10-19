import { pipelineModelUsageStatistics, type PipelineModelUsageFact } from './model-usage-statistics'

const coverage = { requestedExecutions: 2, executionsWithRecords: 1, truncated: false, rejectedRecords: 0 }
const fact = (patch: Partial<PipelineModelUsageFact> = {}): PipelineModelUsageFact => ({
  originExecutionId: 'execution',
  providerScopeId: 'scope',
  requestId: 'call',
  metricKey: 'token',
  revision: 1,
  provider: 'provider',
  model: 'model',
  promptTokens: 80,
  completionTokens: 20,
  totalTokens: 100,
  pricingStatus: 'priced',
  priceCurrency: 'USD',
  priceAmount: 0.2,
  ...patch
})

describe('linked model-call statistics', () => {
  it('counts overlapping parent/task links once, uses the latest revision and keeps provider scopes and currencies distinct', () => {
    const result = pipelineModelUsageStatistics(
      [
        fact(),
        fact(),
        fact({ revision: 2, totalTokens: 120 }),
        fact({ providerScopeId: 'other', priceCurrency: 'CNY', priceAmount: 1 }),
        fact({ requestId: 'unpriced', pricingStatus: 'unpriced', priceAmount: null })
      ],
      coverage
    )
    expect(result).toMatchObject({ calls: 3, totalTokens: 320, inputTokens: 240, unpricedCalls: 1 })
    expect(result.costs).toEqual([
      { currency: 'CNY', amount: 1, calls: 1 },
      { currency: 'USD', amount: 0.2, calls: 1 }
    ])
    expect(result.byModel).toEqual([
      { provider: 'provider', model: 'model', calls: 3, inputTokens: 240, outputTokens: 60, totalTokens: 320 }
    ])
  })
  it('keeps missing quantities and missing currency distinct from known zero or free calls', () => {
    expect(pipelineModelUsageStatistics([], coverage)).toMatchObject({
      calls: 0,
      totalTokens: null,
      inputTokens: null,
      costs: []
    })
    expect(
      pipelineModelUsageStatistics(
        [
          fact({ promptTokens: null, pricingStatus: 'free', priceAmount: 0 }),
          fact({ requestId: 'no-currency', priceCurrency: null })
        ],
        coverage
      )
    ).toMatchObject({
      calls: 2,
      inputTokens: null,
      totalTokens: 200,
      unpricedCalls: 1,
      costs: [{ currency: 'USD', amount: 0, calls: 1 }]
    })
  })
})
