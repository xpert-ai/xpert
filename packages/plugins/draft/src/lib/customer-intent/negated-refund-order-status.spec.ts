import type { CapabilityVersionBundle, GoldenCaseRevision, LearningEvent, ReplayCaseRequest } from '@xpert-ai/contracts'
import { DefaultRuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { CustomerIntentFeedback } from './feedback'
import { negatedRefundOrderStatus } from './negated-refund-order-status'
import { addVocabulary, baselinePolicy, fingerprint, intentArtifact, intentTarget } from './policy'
import { CustomerIntentProvider } from './provider'

const registry = new DefaultRuntimeCapabilityRegistry()
const feedback = new CustomerIntentFeedback(registry)
const provider = new CustomerIntentProvider(feedback, registry)
const slice = negatedRefundOrderStatus.key
const scope = { type: 'organization' as const, key: 'org' }
const dataset = feedback.dataset([], [])
const heldOut = dataset.cases.filter((c) => c.slice === slice)

function replayRequest(row: GoldenCaseRevision, base = baselinePolicy(), next = baselinePolicy()): ReplayCaseRequest {
  const bundle = (versionId: string, artifactHash: string): CapabilityVersionBundle => ({
    bundleId: versionId,
    bundleHash: artifactHash,
    executionMode: 'replay',
    createdAt: '',
    items: [{ targetId: intentTarget, versionId, artifactHash, providerKey: intentTarget, providerVersion: '3' }]
  })
  const baselineArtifact = intentArtifact(base),
    candidateArtifact = intentArtifact(next)
  return {
    context: {
      tenantId: 'tenant',
      organizationId: scope.key,
      scope,
      targetId: intentTarget,
      correlationId: 'test',
      actor: { actorId: 'test', actorType: 'human' }
    },
    evaluationRunId: 'run',
    candidateId: 'next',
    datasetSnapshotId: 'dataset',
    caseRevision: row,
    baselineArtifact,
    candidateArtifact,
    baselineBundle: bundle('base', baselineArtifact.hash),
    candidateBundle: bundle('next', candidateArtifact.hash),
    randomSeed: 42,
    repeatIndex: 0,
    evaluatorVersion: dataset.evaluatorVersion,
    metricDefinitionVersion: dataset.metricDefinitionVersion
  }
}

it('keeps reviewed inputs out of the independent corpus even after normalization', () => {
  expect(heldOut).toHaveLength(6)
  const first = heldOut[0]
  const key = fingerprint('  ' + first.input['utterance'] + '  ')
  const evidence: LearningEvent = {
    eventId: 'review',
    subjectRef: 'case',
    idempotencyKey: 'review',
    inputFingerprint: key,
    decisionPoint: intentTarget,
    targetId: intentTarget,
    eventType: 'prediction_reviewed',
    schemaVersion: '2',
    scope,
    predictionSummary: 'other',
    finalOutcomeSummary: 'order_status',
    confidence: 1,
    reasonCodes: ['route_corrected'],
    capabilityVersionBundleId: 'bundle',
    bundleHash: 'hash',
    trustLevel: 'L2',
    classification: 'internal',
    redactionStatus: 'redacted',
    eventTime: '',
    createdAt: ''
  }
  const { cases } = feedback.dataset([evidence], [])
  expect(cases.filter((row) => row.slice === slice)).toHaveLength(5)
  expect(cases.filter((row) => row.caseId === key)).toEqual([
    expect.objectContaining({ slice: 'affected:order_status' })
  ])
})

it('scores unseen paraphrases using the frozen policies and excludes memorized or mislabeled cases', async () => {
  const base = baselinePolicy(),
    next = baselinePolicy()
  addVocabulary(next, 'order_status')
  const replay = async (row: GoldenCaseRevision) => {
    const request = replayRequest(row, base, next)
    const result = await provider.runReplayCase(request)
    const [metric] = await provider.evaluateResult(request, result)
    return { result, metric }
  }
  const rows = await Promise.all(heldOut.map(replay))
  expect(rows.every(({ metric }) => metric.slice === slice)).toBe(true)
  expect(rows.filter(({ result }) => result.baselinePassed)).toHaveLength(0)
  expect(rows.filter(({ result }) => result.candidatePassed)).toHaveLength(5)
  next.exact[heldOut[0].caseId] = 'order_status'
  expect((await replay(heldOut[0])).metric.slice).toBeUndefined()
  base.exact[heldOut[1].caseId] = 'order_status'
  expect((await replay(heldOut[1])).metric.slice).toBeUndefined()
  expect((await replay({ ...heldOut[2], input: { utterance: '订单状态' } })).metric.slice).toBeUndefined()
  expect((await replay({ ...heldOut[2], expected: { intent: 'other' } })).metric.slice).toBeUndefined()
})
