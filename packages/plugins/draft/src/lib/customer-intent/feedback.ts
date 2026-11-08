import { Inject, Injectable } from '@nestjs/common'
import { z } from 'zod'
import type { EvolutionFeedbackExecution, EvolutionFeedbackProvider, LearningEvent } from '@xpert-ai/contracts'
import {
  EvolutionRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { changeError } from './errors'
import { intentNode, intentSchema, intentTarget } from './policy'
import { buildIntentCases } from './dataset'
import { routeDecision } from './decision'

const reviewSchema = z.object({ expectedIntent: intentSchema }).strict()

@Injectable()
export class CustomerIntentFeedback implements EvolutionFeedbackProvider {
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
    const parsed = reviewSchema.safeParse(input)
    if (!parsed.success) changeError('invalid_intent_review')
    const body = parsed.data
    const { id, threadId } = execution
    if (!id || !threadId) changeError('invalid_execution_context')
    const { organizationId } = identity
    const runtime = this.capabilities.require(EvolutionRuntimeCapability)
    const result = routeDecision.safeParse(execution.outputs?.output)
    if (!result.success || result.data.executionId !== id) changeError('invalid_execution_context')
    const decision = result.data
    const scope = { type: 'organization' as const, key: organizationId }
    const correct = decision.intent === body.expectedIntent
    const reviewedAt = (execution.completedAt ?? execution.createdAt).toISOString()
    const event = await runtime.ingestLearningEvent({
      ...identity,
      event: {
        eventType: 'prediction_reviewed',
        schemaVersion: '1',
        idempotencyKey: `intent-review:${id}`,
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
    const common = {
      scope,
      executionId: id,
      subjectKey: threadId,
      targetId: intentTarget,
      observedAt: reviewedAt
    }
    if (decision.deploymentId)
      await runtime.recordRuntimeObservation({
        ...identity,
        observation: {
          ...common,
          observationId: `intent:${id}:primary`,
          deploymentId: decision.deploymentId,
          channel: decision.channel,
          bundleId: decision.bundleId,
          success: correct,
          severeError: false,
          latencyMs: decision.latencyMs
        }
      })
    if (decision.shadow) {
      const success = decision.shadow.intent === body.expectedIntent
      await runtime.recordRuntimeObservation({
        ...identity,
        observation: {
          ...common,
          observationId: `intent:${id}:shadow`,
          deploymentId: decision.shadow.deploymentId,
          channel: 'shadow',
          bundleId: decision.shadow.bundleId,
          success,
          baselineSuccess: correct,
          severeError: correct && !success,
          latencyMs: decision.shadow.latencyMs
        }
      })
    }
    return event
  }
}
