import type { EvolutionFeedbackExecution } from '@xpert-ai/contracts'
import { fingerprint } from './policy'
import { reviewAdapter } from './review'

describe('customer intent execution review', () => {
  const text = '先别退款，我只想查订单状态。'
  const run: EvolutionFeedbackExecution = {
    id: 'decision',
    type: 'customer-service-intent',
    threadId: 'thread',
    createdAt: new Date(),
    outputs: {
      output: {
        inputFingerprint: fingerprint(text),
        intent: 'other',
        sourceMessageId: 'turn',
        executionId: 'decision',
        versionId: 'v1',
        bundleId: 'bundle',
        bundleHash: 'hash',
        channel: 'production',
        deploymentId: 'release',
        latencyMs: 5
      }
    }
  }
  const context = { organizationId: 'org', conversationId: 'case-a', reviewedAt: new Date().toISOString() }
  const correction = {
    disposition: 'corrected',
    use: 'case_only',
    expectedLabel: 'order_status',
    reason: 'negation_missed'
  } as const
  it('checks the exact routed input and recorded source', () => {
    expect(reviewAdapter.snapshot(run).sourceMessageId).toBe('turn')
    expect(reviewAdapter.sourceMatches(run, text)).toBe(true)
    expect(reviewAdapter.sourceMatches(run, '我要退款')).toBe(false)
  })
  it('retains case-only quality observations and sends no learning event', () => {
    const result = reviewAdapter.prepare(run, correction, context)
    expect(result.event).toBeUndefined()
    expect(result.observations).toMatchObject([{ deploymentId: 'release', success: false }])
  })
  it('keeps original text out of reusable evidence and attributes its review time', () => {
    const result = reviewAdapter.prepare(run, { ...correction, use: 'similar_cases' }, context)
    expect(result.event).toMatchObject({
      inputFingerprint: fingerprint(text),
      subjectRef: 'case-a',
      eventTime: context.reviewedAt,
      predictionSummary: 'other',
      finalOutcomeSummary: 'order_status',
      bundleHash: 'hash'
    })
    expect(JSON.stringify(result)).not.toContain(text)
  })
  it('rejects learning on confirmations and leaves insufficient evidence unscored', () => {
    expect(() =>
      reviewAdapter.prepare(run, { disposition: 'confirmed', use: 'similar_cases', expectedLabel: 'other' }, context)
    ).toThrow()
    expect(reviewAdapter.prepare(run, { disposition: 'insufficient', use: 'case_only' }, context)).toEqual({
      observations: []
    })
  })
})
