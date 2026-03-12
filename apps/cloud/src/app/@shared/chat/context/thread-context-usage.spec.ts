import { isThreadContextUsageEvent, upsertThreadContextUsage } from './thread-context-usage'

describe('thread-context-usage helpers', () => {
  const event = {
    type: 'thread_context_usage' as const,
    threadId: 'thread-1',
    runId: 'run-1',
    agentKey: 'agent-1',
    updatedAt: '2026-03-12T00:00:00.000Z',
    usage: {
      contextTokens: 10,
      inputTokens: 10,
      outputTokens: 2,
      totalTokens: 12,
      embedTokens: 0,
      totalPrice: 0.1,
      currency: 'USD'
    }
  }

  it('detects realtime thread context usage events', () => {
    expect(isThreadContextUsageEvent(event)).toBe(true)
    expect(isThreadContextUsageEvent({ type: 'sandbox' })).toBe(false)
  })

  it('stores the latest usage by agent key', () => {
    expect(upsertThreadContextUsage({}, event)).toEqual({
      'agent-1': event
    })
  })
})
