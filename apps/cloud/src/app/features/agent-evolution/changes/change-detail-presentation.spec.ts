import {
  evidenceDrivenStrategy,
  FEEDBACK_LEARNING_STRATEGY,
  HUMAN_PROPOSAL_STRATEGY,
  type EvolutionChange,
  type EvolutionLifecycleRecord
} from '@xpert-ai/contracts'
import { changeDetailPresentation } from './change-detail-presentation'

function fixture(): EvolutionChange {
  return {
    contractVersion: 3,
    changeId: 'change',
    targetId: 'example.resource',
    requestId: 'request',
    strategy: {
      definition: evidenceDrivenStrategy({ version: '1', evidenceKinds: ['document'], requiredChecks: [] }),
      riskLevel: 'R1',
      hash: 'strategy',
      providerKey: 'example',
      providerVersion: '1'
    },
    sourceKind: 'business_evidence',
    learningEventIds: [],
    candidateInput: {},
    datasetSnapshotIds: {},
    stages: [
      { key: 'learning', status: 'not_applicable' },
      { key: 'candidate', status: 'failed' },
      { key: 'evaluation', status: 'pending' },
      { key: 'approval', status: 'pending' },
      { key: 'publication', status: 'pending' },
      { key: 'effect', status: 'pending' }
    ],
    scope: { type: 'organization', key: 'org' },
    baseline: { resourceId: 'base', version: '1', hash: 'base' },
    evidence: [],
    evidenceHash: 'evidence',
    status: 'failed',
    failureReasons: ['Unrecognized provider failure'],
    jobId: 'job',
    createdBy: 'user',
    createdAt: '2026-09-24',
    updatedAt: '2026-09-24'
  }
}

it('shows the actual draft failure and marks downstream work as not started without a learning step', () => {
  const change = fixture(),
    before = structuredClone(change),
    view = changeDetailPresentation(change)
  expect(view.result).toBe('DraftFailed')
  expect(view.reasons).toEqual(['Unrecognized provider failure'])
  expect(view.steps.map((step) => step.key)).toEqual(['candidate', 'evaluation', 'approval', 'publication', 'effect'])
  expect(view.steps.slice(1).every((step) => step.status === 'pending' && step.blockedBy === 'candidate')).toBe(true)
  expect(view.checkState).toBe('pending')
  expect(change).toEqual(before)
})

it.each(['pending', 'running'] as const)('keeps the check phase %s after a successful draft', (status) => {
  const change = fixture()
  change.status = 'testing'
  change.failureReasons = []
  change.stages = [
    { key: 'candidate', status: 'passed' },
    { key: 'evaluation', status }
  ]
  const view = changeDetailPresentation(change)
  expect(view.checkState).toBe(status)
  expect(view.failed).toBe(false)
  expect(view.result).toBe(status === 'running' ? 'Checking' : 'AwaitingChecks')
})

it('shows failed checks, with their real reasons, instead of reporting a passed count as success', () => {
  const change = fixture()
  change.status = 'test_failed'
  change.failureReasons = []
  change.stages = [
    { key: 'candidate', status: 'passed' },
    { key: 'evaluation', status: 'failed' }
  ]
  change.evaluation = {
    runId: 'run',
    candidateHash: 'candidate',
    baselineHash: 'base',
    evidenceHash: 'evidence',
    datasetVersion: '1',
    datasetHash: 'dataset',
    passed: false,
    completedAt: '2026-09-24',
    readiness: [],
    checks: [
      {
        checkId: 'boundary',
        title: 'Boundary check',
        kind: 'boundary',
        origin: 'fixture',
        passed: false,
        blocking: true,
        details: 'Required boundary is missing',
        evidenceRefs: []
      }
    ]
  }
  expect(changeDetailPresentation(change)).toMatchObject({
    result: 'ChecksFailed',
    checkState: 'failed',
    reasons: ['Required boundary is missing']
  })
  change.status = 'pending_approval'
  change.evaluation.passed = true
  change.evaluation.checks = []
  change.stages[1].status = 'passed'
  expect(changeDetailPresentation(change)).toMatchObject({ result: 'AwaitingReview', checkState: 'passed' })
})

it('keeps publication and adoption separate, even when old provider counts are inconsistent', () => {
  const change = fixture()
  change.presentation = {
    title: 'Resource',
    resourceLabel: 'Family',
    business: {
      title: 'Add attribute',
      context: [],
      evidence: [],
      changes: [],
      adoption: { subjectLabel: 'products', adopted: 1, total: 1 }
    }
  }
  expect(changeDetailPresentation(change).published).toBe(false)
  change.status = 'published'
  change.stages = []
  change.receipt = {
    receiptId: 'receipt',
    changeId: 'change',
    candidateHash: 'candidate',
    approvalId: 'approval',
    completedAt: '2026-09-24',
    resource: { resourceId: 'new', version: '2', hash: 'new' }
  }
  change.presentation.business!.adoption!.adopted = 0
  expect(changeDetailPresentation(change).result).toBe('AwaitingAdoption')
  change.presentation.business!.adoption!.adopted = 1
  expect(changeDetailPresentation(change).result).toBe('Adopted')
})

it('leaves missing failure details empty for an explicit UI fallback and never interprets the title', () => {
  const change = fixture()
  change.failureReasons = [' ']
  change.presentation = { title: 'new_feature RAL7001', resourceLabel: 'Resource' }
  expect(changeDetailPresentation(change).reasons).toEqual([])
  expect(changeDetailPresentation(change).business).toBeUndefined()
})

it('uses non-BOM strategy capabilities for learning, assessment and activation', () => {
  const change = fixture()
  change.strategy.definition = FEEDBACK_LEARNING_STRATEGY
  change.stages[0].status = 'passed'
  expect(changeDetailPresentation(change).steps[0].key).toBe('learning')
  expect(changeDetailPresentation(change).steps.at(-1)?.labelKey).toBe('XP.AgentEvolution.StrategyStage.effect')
  change.strategy.definition = HUMAN_PROPOSAL_STRATEGY
  change.stages = []
  change.status = 'pending_approval'
  expect(changeDetailPresentation(change).checkState).toBe('not_applicable')
  expect(changeDetailPresentation(change).result).toBe('AwaitingHumanReview')
  expect(changeDetailPresentation(change).steps.some((step) => step.key === 'learning')).toBe(false)
})

it('uses the actual staged release state instead of reporting that an approved candidate is awaiting publication', () => {
  const change = fixture()
  change.strategy.definition = FEEDBACK_LEARNING_STRATEGY
  change.status = 'approved'
  change.stages = [
    { key: 'candidate', status: 'passed' },
    { key: 'evaluation', status: 'passed' }
  ]
  const lifecycle: EvolutionLifecycleRecord = {
    id: change.changeId,
    targetId: change.targetId,
    title: 'Template update',
    scope: change.scope,
    phase: 'publication',
    status: 'canary',
    createdAt: change.createdAt,
    updatedAt: change.updatedAt,
    strategy: change.strategy,
    stages: change.stages,
    sourceKind: change.sourceKind,
    releasePackageId: 'release',
    publicationStatus: 'publishing',
    effectStatus: 'partial',
    baseline: change.baseline,
    approvals: [],
    capabilities: { stagedRollout: true, evaluate: false, decide: false, publish: false }
  }
  const view = changeDetailPresentation(change, lifecycle)
  expect(view).toMatchObject({ published: false, result: 'StagedRelease', stagedStatus: 'canary' })
  expect(view.steps.find((step) => step.key === 'publication')?.status).toBe('running')
  lifecycle.status = 'paused'
  lifecycle.publicationStatus = 'blocked'
  expect(changeDetailPresentation(change, lifecycle).steps.find((step) => step.key === 'publication')?.status).toBe(
    'paused'
  )
  lifecycle.status = 'rolled_back'
  lifecycle.publicationStatus = 'closed'
  expect(changeDetailPresentation(change, lifecycle)).toMatchObject({ published: false, stagedStatus: 'rolled_back' })
})

it('does not invent an adoption state when the provider does not supply it', () => {
  const change = fixture()
  change.status = 'published'
  change.stages = []
  change.presentation = {
    title: 'Resource',
    resourceLabel: 'Resource',
    effect: { status: 'unknown', label: 'Adoption' }
  }
  const view = changeDetailPresentation(change)
  expect(view.result).toBe('Published')
  expect(view.steps.find((step) => step.key === 'effect')?.status).toBe('unknown')
})
