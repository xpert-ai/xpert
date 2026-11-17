import { Inject, Injectable } from '@nestjs/common'
import type { EvolutionFeedbackExecution, EvolutionFeedbackProvider, LearningEvent } from '@xpert-ai/contracts'
import {
  EvolutionRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { changeError } from './errors'
import { intentNode, intentTarget } from './policy'
import { buildIntentCases } from './dataset'
import { routeDecision } from './decision'
import { legacyIntentReviewSchema, recordedRouteDecision, reviewAdapter, reviewedObservations } from './review'

@Injectable()
export class CustomerIntentFeedback implements EvolutionFeedbackProvider {
  readonly workbench = reviewAdapter
  readonly routeKey = 'customer-intent'
  readonly executionType = intentNode
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry) {}

  dataset(events: LearningEvent[], executions: EvolutionFeedbackExecution[]) {
    const features = new Map<string, string[]>()
    for (const run of executions) {
      const decision = routeDecision.safeParse(run.outputs?.output)
      if (decision.success && decision.data.features)
        features.set(decision.data.inputFingerprint, decision.data.features)
    }
    return {
      name: 'Customer service routing regression',
      evaluatorVersion: '1',
      metricDefinitionVersion: '1',
      cases: buildIntentCases(events, features)
    }
  }

  async review(
    identity: { tenantId: string; organizationId: string },
    execution: EvolutionFeedbackExecution,
    input: unknown
  ) {
    const parsed = legacyIntentReviewSchema.safeParse(input)
    if (!parsed.success) changeError('invalid_intent_review')
    const body = parsed.data
    const { id, threadId } = execution
    const decision = recordedRouteDecision(execution)
    const { organizationId } = identity
    const runtime = this.capabilities.require(EvolutionRuntimeCapability)
    const scope = { type: 'organization' as const, key: organizationId }
    const correct = decision.intent === body.expectedIntent
    const reviewedAt = (execution.completedAt ?? execution.createdAt).toISOString()
    const event = await runtime.ingestLearningEvent({
      ...identity,
      event: {
        eventType: 'prediction_reviewed',
        schemaVersion: '1',
        idempotencyKey: reviewAdapter.legacyKey(id),
        eventTime: reviewedAt,
        scope,
        executionId: id,
        threadId: threadId,
        targetId: intentTarget,
        decisionPoint: intentTarget,
        subjectRef: threadId,
        inputFingerprint: decision.inputFingerprint,
        predictionSummary: decision.intent,
        finalOutcomeSummary: body.expectedIntent,
        confidence: 1,
        reasonCodes: [correct ? 'route_confirmed' : 'route_corrected'],
        capabilityVersionBundleId: decision.bundleId,
        bundleHash: decision.bundleHash,
        trustLevel: 'L2',
        classification: 'internal',
        redactionStatus: 'redacted'
      }
    })
    if (event.finalOutcomeSummary !== body.expectedIntent) changeError('immutable_review_changed')
    for (const observation of reviewedObservations(
      decision,
      threadId,
      organizationId,
      body.expectedIntent,
      reviewedAt
    )) {
      await runtime.recordRuntimeObservation({ ...identity, observation })
    }
    return event
  }
}
