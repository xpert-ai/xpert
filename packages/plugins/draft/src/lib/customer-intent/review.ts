import type {
  ExecutionReviewAdapter,
  ExecutionReviewDecision,
  EvolutionFeedbackExecution,
  EvolutionRuntimeObservationInput
} from '@xpert-ai/contracts'
import { z } from 'zod'
import { routeDecision } from './decision'
import { fingerprint, intentSchema, intentTarget } from './policy'
import { changeError } from './errors'

export const reviewFeature = 'customer-intent.review'
export const reviewMiddleware = 'customer-intent-review'
export const reasons = ['negation_missed', 'missing_phrase', 'ambiguous_request', 'other_reason'] as const
const reviewInput = z
  .object({
    disposition: z.enum(['confirmed', 'corrected', 'insufficient']),
    use: z.enum(['case_only', 'similar_cases']),
    expectedLabel: intentSchema.optional(),
    reason: z.enum(reasons).optional()
  })
  .strict()
export const legacyInput = z.object({ expectedIntent: intentSchema }).strict()

function recorded(run: EvolutionFeedbackExecution) {
  const parsed = routeDecision.safeParse(run.outputs?.output)
  if (!parsed.success || parsed.data.executionId !== run.id || !run.threadId) changeError('invalid_execution_context')
  return parsed.data
}

export function reviewedObservations(
  run: EvolutionFeedbackExecution,
  organizationId: string,
  expected: string,
  at: string
) {
  const d = recorded(run)
  const common = {
    scope: { type: 'organization' as const, key: organizationId },
    subjectKey: run.threadId,
    executionId: d.executionId,
    targetId: intentTarget,
    observedAt: at
  }
  const correct = d.intent === expected
  const observations: EvolutionRuntimeObservationInput[] = []
  if (d.deploymentId)
    observations.push({
      ...common,
      observationId: `intent:${d.executionId}:primary`,
      deploymentId: d.deploymentId,
      bundleId: d.bundleId,
      channel: d.channel,
      latencyMs: d.latencyMs,
      success: correct,
      severeError: false
    })
  if (d.shadow)
    observations.push({
      ...common,
      observationId: `intent:${d.executionId}:shadow`,
      deploymentId: d.shadow.deploymentId,
      bundleId: d.shadow.bundleId,
      channel: 'shadow',
      latencyMs: d.shadow.latencyMs,
      baselineSuccess: correct,
      success: d.shadow.intent === expected,
      severeError: correct && d.shadow.intent !== expected
    })
  return observations
}
export const reviewAdapter: ExecutionReviewAdapter = {
  feature: reviewFeature,
  legacyKey: (id) => `intent-review:${id}`,
  matchesLegacy(input, receipt) {
    const parsed = legacyInput.safeParse(input)
    return parsed.success && parsed.data.expectedIntent === receipt.expectedLabel
  },
  snapshot(run) {
    const d = recorded(run)
    return {
      originalLabel: d.intent,
      versionId: d.versionId,
      bundleHash: d.bundleHash,
      sourceMessageId: d.sourceMessageId
    }
  },
  sourceMatches(run, text) {
    return recorded(run).inputFingerprint === fingerprint(text)
  },
  prepare(run, decision: ExecutionReviewDecision, { organizationId, conversationId, reviewedAt }) {
    const checked = reviewInput.safeParse(decision)
    if (!checked.success) changeError('invalid_intent_review')
    const d = recorded(run),
      v = checked.data
    if (v.disposition === 'insufficient') {
      if (v.use !== 'case_only' || v.expectedLabel || v.reason) changeError('invalid_intent_review')
      return { observations: [] }
    }
    const expected = v.expectedLabel
    if (
      !expected ||
      (v.disposition === 'confirmed') !== (expected === d.intent) ||
      (v.disposition === 'confirmed' && (v.use !== 'case_only' || v.reason)) ||
      (v.disposition === 'corrected' && !v.reason)
    )
      changeError('invalid_intent_review')
    const observations = reviewedObservations(run, organizationId, expected, reviewedAt)
    if (v.use === 'case_only') return { observations }
    return {
      observations,
      event: {
        eventType: 'prediction_reviewed',
        schemaVersion: '2',
        idempotencyKey: this.legacyKey(d.executionId),
        eventTime: reviewedAt,
        scope: { type: 'organization', key: organizationId },
        executionId: d.executionId,
        threadId: run.threadId,
        targetId: intentTarget,
        decisionPoint: intentTarget,
        subjectRef: conversationId,
        inputFingerprint: d.inputFingerprint,
        predictionSummary: d.intent,
        finalOutcomeSummary: expected,
        confidence: 1,
        reasonCodes: ['route_corrected', d.intent + '_to_' + expected, v.reason],
        capabilityVersionBundleId: d.bundleId,
        bundleHash: d.bundleHash,
        trustLevel: 'L2',
        classification: 'internal',
        redactionStatus: 'redacted'
      }
    }
  }
}
