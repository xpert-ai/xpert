import type { BuildEvolutionCandidateRequest, LearningEvent } from '@xpert-ai/contracts'
import { DefaultRuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { CustomerIntentFeedback } from './feedback'
import { baselinePolicy, fingerprint, intentArtifact, intentTarget, readIntentPolicy } from './policy'
import { CustomerIntentProvider } from './provider'

it('rebuilds the approved vocabulary in proposal order even if evidence storage returns rows in another order', async () => {
  const scope = { type: 'organization' as const, key: 'org' }
  const capabilities = new DefaultRuntimeCapabilityRegistry()
  const provider = new CustomerIntentProvider(new CustomerIntentFeedback(capabilities), capabilities)
  const event = (id: string, intent: string): LearningEvent => ({
    eventId: id,
    subjectRef: id,
    idempotencyKey: id,
    inputFingerprint: fingerprint(id),
    targetId: intentTarget,
    decisionPoint: intentTarget,
    eventType: 'prediction_reviewed',
    schemaVersion: '1',
    scope,
    predictionSummary: 'other',
    finalOutcomeSummary: intent,
    confidence: 1,
    reasonCodes: ['route_corrected'],
    capabilityVersionBundleId: 'base',
    bundleHash: 'baseline',
    trustLevel: 'L2',
    classification: 'internal',
    redactionStatus: 'redacted',
    eventTime: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z'
  })
  const refund = event('refund-case', 'refund'),
    order = event('order-case', 'order_status')
  const request: BuildEvolutionCandidateRequest = {
    context: {
      tenantId: 'tenant',
      organizationId: scope.key,
      targetId: intentTarget,
      scope,
      correlationId: 'test',
      actor: { actorId: 'reviewer', actorType: 'human' }
    },
    scope,
    targetId: intentTarget,
    proposalId: 'proposal',
    proposalRevision: 1,
    baseVersionId: 'base',
    baseArtifact: intentArtifact(baselinePolicy()),
    changeSet: { expandIntentVocabulary: true },
    evidenceEventIds: [refund.eventId, order.eventId],
    dependencyVersionIds: [],
    actorId: 'reviewer',
    idempotencyKey: 'build'
  }
  const build = (evidenceEvents: LearningEvent[]) => provider.buildCandidate({ ...request, evidenceEvents })
  const original = await build([refund, order])
  expect((await build([order, refund])).artifact.hash).toBe(original.artifact.hash)
  expect(readIntentPolicy(original.artifact).phrases.map((rule) => rule.intent)).toEqual(['refund', 'order_status'])
  await expect(build([order])).rejects.toThrow('learning_evidence_gate_failed')
  await expect(build([order, { ...refund, scope: { ...scope, key: 'different-org' } }])).rejects.toThrow(
    'learning_evidence_gate_failed'
  )
})
