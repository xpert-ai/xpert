import { TestBed } from '@angular/core/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  FEEDBACK_LEARNING_STRATEGY,
  evidenceDrivenStrategy,
  type EvolutionChange,
  type EvolutionLifecycleRecord
} from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import english from '../../../assets/i18n/en.json'
import { AgentEvolutionApiService } from './agent-evolution-api.service'
import { AgentEvolutionFacade } from './agent-evolution.facade'

const mockToast = { error: jest.fn(), info: jest.fn() }
jest.mock('@cloud/app/@core', () => ({
  injectToastr: () => mockToast,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error))
}))

const change: EvolutionChange = {
  contractVersion: 3,
  changeId: 'change-auto',
  requestId: 'request-auto',
  targetId: 'model',
  strategy: {
    definition: evidenceDrivenStrategy({ version: '1', evidenceKinds: ['document'], requiredChecks: [] }),
    riskLevel: 'R1',
    hash: 'strategy',
    providerKey: 'model',
    providerVersion: '1'
  },
  sourceKind: 'business_evidence',
  learningEventIds: [],
  candidateInput: {},
  datasetSnapshotIds: {},
  stages: [],
  scope: { type: 'organization', key: 'org' },
  baseline: { resourceId: 'model', version: '1', hash: 'baseline' },
  evidence: [],
  evidenceHash: 'evidence',
  status: 'pending_approval',
  createdBy: 'reviewer',
  createdAt: '2026-09-01',
  updatedAt: '2026-09-01',
  candidate: {
    artifact: { uri: 'model://draft', hash: 'candidate', schemaVersion: '1' },
    baseline: { resourceId: 'model', version: '1', hash: 'baseline' },
    summary: 'Add automotive motor color',
    changes: [],
    warnings: []
  },
  evaluation: {
    runId: 'evaluation',
    candidateHash: 'candidate',
    baselineHash: 'baseline',
    evidenceHash: 'evidence',
    datasetVersion: '1',
    datasetHash: 'dataset',
    checks: [],
    readiness: [],
    passed: true,
    completedAt: '2026-09-01'
  }
}
const record = (status: string): EvolutionLifecycleRecord => ({
  id: change.changeId,
  targetId: change.targetId,
  title: 'Automotive model',
  scope: change.scope,
  baseline: change.baseline,
  phase: 'publication',
  status,
  strategy: change.strategy,
  stages: [],
  sourceKind: change.sourceKind,
  publicationStatus: status === 'published' ? 'published' : 'review',
  effectStatus: 'pending',
  approvals: [],
  createdAt: change.createdAt,
  updatedAt: change.updatedAt,
  capabilities: { stagedRollout: false, evaluate: false, decide: false, publish: status === 'approved' }
})

let facade: AgentEvolutionFacade
let api: {
  decideChange: jest.Mock
  publishChange: jest.Mock
  listChanges: jest.Mock
  listLifecycleRecords: jest.Mock
  getJob: jest.Mock
}
beforeEach(() => {
  jest.clearAllMocks()
  api = {
    decideChange: jest.fn(() => of(record('approved'))),
    publishChange: jest.fn(() => of(record('published'))),
    listChanges: jest.fn(() => of([change])),
    listLifecycleRecords: jest.fn(() => of({ items: [record('pending_approval')], total: 1 })),
    getJob: jest.fn()
  }
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [{ provide: AgentEvolutionApiService, useValue: api }]
  })
  const translate = TestBed.inject(TranslateService)
  translate.setTranslation('en', english)
  translate.use('en')
  facade = TestBed.inject(AgentEvolutionFacade)
  jest.spyOn(facade, 'load').mockResolvedValue(null)
})

it('approves the displayed checked draft before publishing that same change', async () => {
  const result = await facade.approveAndPublishChange(change, ' Verified source ')
  expect(api.decideChange).toHaveBeenCalledWith('change-auto', {
    candidateHash: 'candidate',
    evaluationRunId: 'evaluation',
    decision: 'approved',
    reason: 'Verified source'
  })
  expect(api.publishChange).toHaveBeenCalledWith('change-auto')
  expect(api.decideChange.mock.invocationCallOrder[0]).toBeLessThan(api.publishChange.mock.invocationCallOrder[0])
  expect(result?.status).toBe('published')
  expect(facade.load).toHaveBeenCalledWith({ silent: true })
  expect(facade.mutating()).toBe(false)
})

it('does not publish when approval is rejected by the server', async () => {
  api.decideChange.mockReturnValue(throwError(() => new Error('tests_must_pass')))
  expect(await facade.approveAndPublishChange(change, 'Verified')).toBeNull()
  expect(api.publishChange).not.toHaveBeenCalled()
  expect(facade.error()).toContain('tests_must_pass')
})

it('waits for the remaining reviewers instead of bypassing the approval gate', async () => {
  api.decideChange.mockReturnValue(of(record('pending_approval')))
  expect((await facade.approveAndPublishChange(change, 'Verified'))?.status).toBe('pending_approval')
  expect(api.publishChange).not.toHaveBeenCalled()
  expect(mockToast.info).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'XP.AgentEvolution.ApprovalRecordedPending' })
  )
})

it('retains approval on publication failure and retries publication without another decision', async () => {
  api.publishChange.mockReturnValueOnce(throwError(() => new Error('reference_dataset_stale')))
  expect(await facade.approveAndPublishChange(change, 'Verified')).toBeNull()
  expect(facade.error()).toContain('Approval is recorded')
  expect(facade.error()).toContain('reference_dataset_stale')
  expect(facade.load).toHaveBeenCalled()
  expect((await facade.publishApprovedChange({ ...change, status: 'publishing' }))?.status).toBe('published')
  expect(api.decideChange).toHaveBeenCalledTimes(1)
  expect(api.publishChange).toHaveBeenCalledTimes(2)
})

it('prevents duplicate approval and publication while the operation is in progress', async () => {
  const response = new Subject<EvolutionLifecycleRecord>()
  api.decideChange.mockReturnValue(response)
  const first = facade.approveAndPublishChange(change, 'Verified')
  expect(facade.mutating()).toBe(true)
  expect(await facade.approveAndPublishChange(change, 'Verified')).toBeNull()
  expect(await facade.publishApprovedChange({ ...change, status: 'approved' })).toBeNull()
  expect(api.publishChange).not.toHaveBeenCalled()
  response.next(record('approved'))
  await first
  expect(api.decideChange).toHaveBeenCalledTimes(1)
  expect(api.publishChange).toHaveBeenCalledTimes(1)
})

it('does not publish into a changed organization context after approval returns', async () => {
  const response = new Subject<EvolutionLifecycleRecord>()
  api.decideChange.mockReturnValue(response)
  const pending = facade.approveAndPublishChange(change, 'Verified')
  facade.resetScopeContext()
  response.next(record('approved'))
  await pending
  expect(api.publishChange).not.toHaveBeenCalled()
})

it('does not combine staged rollout, incomplete drafts, failed checks or empty review reasons', async () => {
  for (const item of [
    { ...change, strategy: { ...change.strategy, definition: FEEDBACK_LEARNING_STRATEGY } },
    { ...change, candidate: undefined },
    { ...change, evaluation: { ...change.evaluation!, passed: false } },
    { ...change, status: 'test_failed' as const }
  ])
    expect(await facade.approveAndPublishChange(item, 'Verified')).toBeNull()
  expect(await facade.approveAndPublishChange(change, ' ')).toBeNull()
  expect(api.decideChange).not.toHaveBeenCalled()
  expect(api.publishChange).not.toHaveBeenCalled()
})

it('refreshes lifecycle selection and detail stages together with changes and the active job', async () => {
  const preparing = { ...change, status: 'preparing' as const, candidate: undefined, evaluation: undefined }
  const running = { ...record('preparing'), stages: [{ key: 'candidate' as const, status: 'running' as const }] }
  const added = { ...change, changeId: 'new-change' }
  const addedRecord = { ...record('pending_approval'), id: added.changeId }
  const job = { jobId: 'job', jobType: 'change_preparation' as const, status: 'running' as const, createdAt: '' }
  facade.changes.set([preparing])
  facade.lifecycleRecords.set([{ ...running, stages: [{ key: 'candidate', status: 'pending' }] }])
  facade.activeJob.set(job)
  api.listChanges.mockReturnValue(of([preparing, added]))
  api.listLifecycleRecords.mockReturnValue(of({ items: [running, addedRecord], total: 2 }))
  api.getJob.mockReturnValue(of({ ...job, status: 'completed' }))

  await facade.refreshChanges()

  expect(facade.contextLifecycleRecords()).toEqual([running, addedRecord])
  expect(facade.contextChanges()).toEqual([preparing, added])
  expect(facade.activeJob()?.status).toBe('completed')
})

it('keeps the previous change and lifecycle snapshot if a refresh request fails', async () => {
  facade.changes.set([change])
  facade.lifecycleRecords.set([record('pending_approval')])
  api.listChanges.mockReturnValue(of([{ ...change, status: 'published' }]))
  api.listLifecycleRecords.mockReturnValue(throwError(() => new Error('lifecycle unavailable')))
  await facade.refreshChanges()
  expect(facade.changes()).toEqual([change])
  expect(facade.lifecycleRecords()).toEqual([record('pending_approval')])
  expect(facade.providerError()).toBe('lifecycle unavailable')
})

it('discards both refresh responses when the organization changes', async () => {
  const response = new Subject<{ items: EvolutionLifecycleRecord[]; total: number }>()
  api.listLifecycleRecords.mockReturnValue(response)
  const pending = facade.refreshChanges()
  facade.resetScopeContext()
  response.next({ items: [record('pending_approval')], total: 1 })
  await pending
  expect(facade.changes()).toEqual([])
  expect(facade.lifecycleRecords()).toEqual([])
})
