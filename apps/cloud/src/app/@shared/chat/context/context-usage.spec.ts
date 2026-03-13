import { buildContextUsageTooltip, getHistoricalContextTokens, resolveContextUsage } from './context-usage'

describe('chat input context usage helpers', () => {
  const usageEvent = {
    type: 'thread_context_usage' as const,
    threadId: 'thread-1',
    runId: 'run-1',
    agentKey: 'agent-1',
    updatedAt: '2026-03-12T00:00:00.000Z',
    usage: {
      contextTokens: 90,
      inputTokens: 90,
      outputTokens: 10,
      totalTokens: 100,
      embedTokens: 0,
      totalPrice: 0.1,
      currency: 'USD'
    }
  }

  it('returns the last ai execution tokens for historical conversations', () => {
    expect(
      getHistoricalContextTokens([
        { role: 'user', execution: { tokens: 20 } },
        { role: 'ai', execution: { tokens: 40 } },
        { role: 'ai', execution: { tokens: 60 } }
      ])
    ).toBe(60)
  })

  it('prefers realtime usage while answering', () => {
    expect(
      resolveContextUsage({
        answering: true,
        realtimeUsage: usageEvent,
        historicalTokens: 80
      })
    ).toEqual({
      source: 'realtime',
      usedTokens: 100
    })
  })

  it('prefers historical execution tokens when idle', () => {
    expect(
      resolveContextUsage({
        answering: false,
        realtimeUsage: usageEvent,
        historicalTokens: 80
      })
    ).toEqual({
      source: 'historical',
      usedTokens: 80
    })
  })

  it('only shows input and output details when realtime totals match the displayed numerator', () => {
    expect(
      buildContextUsageTooltip({
        usedTokens: 80,
        contextWindowSize: 200,
        usage: usageEvent
      })
    ).toBe('Context window:\n40% full\n80 / 200 tokens used')

    expect(
      buildContextUsageTooltip({
        usedTokens: 100,
        contextWindowSize: 200,
        usage: usageEvent
      })
    ).toBe('Context window:\n50% full\n100 / 200 tokens used\nInput: 90  Output: 10')
  })
})
