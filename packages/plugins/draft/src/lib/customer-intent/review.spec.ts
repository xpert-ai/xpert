import type { EvolutionFeedbackExecution } from '@xpert-ai/contracts'
import { DefaultRuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { CustomerIntentFeedback } from './feedback'
import { fingerprint } from './policy'
import { reviewAdapter } from './review'

describe('customer intent execution review', () => {
  const text = '先别退款，我只想查订单状态。'
  const run: EvolutionFeedbackExecution = {
    id: 'decision',
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
  it('accepts older routing outputs without a source ID and rejects a mismatched execution', () => {
    const { sourceMessageId: _, ...historical } = run.outputs.output
    expect(reviewAdapter.snapshot({ ...run, outputs: { output: historical } }).sourceMessageId).toBeUndefined()
    expect(() => reviewAdapter.snapshot({ ...run, id: 'other-execution' })).toThrow('invalid_execution_context')
  })
  it('retains case-only quality observations and sends no learning event', () => {
    const result = reviewAdapter.prepare(run, correction, context)
    expect(result.event).toBeUndefined()
    expect(result.observations).toMatchObject([{ deploymentId: 'release', success: false }])
  })
  it('shares the review identity with legacy feedback and scores the shadow route against the same correction', () => {
    const feedback = new CustomerIntentFeedback(new DefaultRuntimeCapabilityRegistry())
    expect(feedback.workbench).toBe(reviewAdapter)
    const shadow = { intent: 'order_status', bundleId: 'candidate', deploymentId: 'shadow-release', latencyMs: 2 }
    const execution = { ...run, outputs: { output: { ...run.outputs.output, shadow } } }
    const { event, observations } = feedback.workbench.prepare(
      execution,
      { ...correction, use: 'similar_cases' },
      context
    )
    expect(event?.idempotencyKey).toBe('intent-review:' + run.id)
    expect(observations).toMatchObject([
      { channel: 'production', success: false },
      { channel: 'shadow', baselineSuccess: false, success: true, severeError: false }
    ])
    const receipt = {
      ...correction,
      receiptId: 'receipt',
      executionId: run.id,
      originalLabel: 'other',
      versionId: 'v1',
      reviewerId: 'supervisor',
      reviewedAt: context.reviewedAt
    }
    expect(feedback.workbench.matchesLegacy({ expectedIntent: 'order_status' }, receipt)).toBe(true)
    expect(feedback.workbench.matchesLegacy({ expectedIntent: 'refund' }, receipt)).toBe(false)
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
