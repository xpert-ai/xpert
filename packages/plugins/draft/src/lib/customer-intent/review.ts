import type {
  ExecutionReviewAdapter,
  EvolutionFeedbackExecution,
  EvolutionRuntimeObservationInput
} from '@xpert-ai/contracts'
import { z } from 'zod'
import { routeDecision } from './decision'
import { fingerprint, intentSchema, intentTarget } from './policy'
import { changeError } from './errors'
import { reviewFeature } from './review-access'

const reasons = ['negation_missed', 'missing_phrase', 'ambiguous_request', 'other_reason'] as const
export const intentReviewDecisionSchema = z
  .object({
    disposition: z.enum(['confirmed', 'corrected', 'insufficient']),
    use: z.enum(['case_only', 'similar_cases']),
    expectedLabel: intentSchema.optional(),
    reason: z.enum(reasons).optional()
  })
  .strict()
export const legacyIntentReviewSchema = z.object({ expectedIntent: intentSchema }).strict()

export function recordedRouteDecision(run: EvolutionFeedbackExecution) {
  const parsed = routeDecision.safeParse(run.outputs?.output)
  if (!run.id || !run.threadId || !parsed.success || parsed.data.executionId !== run.id)
    changeError('invalid_execution_context')
  return parsed.data
}

export function reviewedObservations(
  decision: z.output<typeof routeDecision>,
  threadId: string,
  organizationId: string,
  expected: string,
  at: string
) {
  const common = {
    scope: { type: 'organization' as const, key: organizationId },
    subjectKey: threadId,
    executionId: decision.executionId,
    targetId: intentTarget,
    observedAt: at
  }
  const correct = decision.intent === expected
  const observations: EvolutionRuntimeObservationInput[] = []
  if (decision.deploymentId)
    observations.push({
      ...common,
      observationId: `intent:${decision.executionId}:primary`,
      deploymentId: decision.deploymentId,
      bundleId: decision.bundleId,
      channel: decision.channel,
      latencyMs: decision.latencyMs,
      success: correct,
      severeError: false
    })
  if (decision.shadow)
    observations.push({
      ...common,
      observationId: `intent:${decision.executionId}:shadow`,
      deploymentId: decision.shadow.deploymentId,
      bundleId: decision.shadow.bundleId,
      channel: 'shadow',
      latencyMs: decision.shadow.latencyMs,
      baselineSuccess: correct,
      success: decision.shadow.intent === expected,
      severeError: correct && decision.shadow.intent !== expected
    })
  return observations
}

export const reviewAdapter: ExecutionReviewAdapter = {
  feature: reviewFeature,
  legacyKey: (id) => `intent-review:${id}`,
  matchesLegacy(input, receipt) {
    const parsed = legacyIntentReviewSchema.safeParse(input)
    return parsed.success && parsed.data.expectedIntent === receipt.expectedLabel
  },
  snapshot(run) {
    const route = recordedRouteDecision(run)
    return {
      originalLabel: route.intent,
      versionId: route.versionId,
      bundleHash: route.bundleHash,
      sourceMessageId: route.sourceMessageId
    }
  },
  sourceMatches(run, text) {
    return recordedRouteDecision(run).inputFingerprint === fingerprint(text)
  },
  prepare(run, decision, { organizationId, conversationId, reviewedAt }) {
    const checked = intentReviewDecisionSchema.safeParse(decision)
    if (!checked.success) changeError('invalid_intent_review')
    const route = recordedRouteDecision(run)
    const review = checked.data
    if (review.disposition === 'insufficient') {
      if (review.use !== 'case_only' || review.expectedLabel || review.reason) changeError('invalid_intent_review')
      return { observations: [] }
    }
    const expected = review.expectedLabel
    if (
      !expected ||
      (review.disposition === 'confirmed') !== (expected === route.intent) ||
      (review.disposition === 'confirmed' && (review.use !== 'case_only' || review.reason)) ||
      (review.disposition === 'corrected' && !review.reason)
    )
      changeError('invalid_intent_review')
    const observations = reviewedObservations(route, run.threadId, organizationId, expected, reviewedAt)
    if (review.use === 'case_only') return { observations }
    return {
      observations,
      event: {
        eventType: 'prediction_reviewed',
        schemaVersion: '2',
        idempotencyKey: this.legacyKey(route.executionId),
        eventTime: reviewedAt,
        scope: { type: 'organization', key: organizationId },
        executionId: route.executionId,
        threadId: run.threadId,
        targetId: intentTarget,
        decisionPoint: intentTarget,
        subjectRef: conversationId,
        inputFingerprint: route.inputFingerprint,
        predictionSummary: route.intent,
        finalOutcomeSummary: expected,
        confidence: 1,
        reasonCodes: ['route_corrected', route.intent + '_to_' + expected, review.reason],
        capabilityVersionBundleId: route.bundleId,
        bundleHash: route.bundleHash,
        trustLevel: 'L2',
        classification: 'internal',
        redactionStatus: 'redacted'
      }
    }
  }
}
