import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { of } from 'rxjs'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { Store } from '@cloud/app/@core/state'
import {
  FEEDBACK_LEARNING_STRATEGY,
  evidenceDrivenStrategy,
  type EvolutionChange,
  type EvolutionLifecycleRecord
} from '@xpert-ai/contracts'
import english from '../../../../assets/i18n/en.json'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'
import { EvolutionApprovalComponent } from './approval.component'

jest.mock('@cloud/app/@core', () => ({
  Store: jest.requireActual('@cloud/app/@core/state').Store,
  AIPermissionsEnum: { EVOLUTION_MANAGE: 'EVOLUTION_MANAGE' },
  injectToastr: () => ({ error: jest.fn(), info: jest.fn() }),
  getErrorMessage: (e: Error) => e.message
}))
const route = '/evaluation/approval/bound'
const SCOPE = { type: 'organization' as const, key: 'fixture' }
function makeChange(direct: boolean): EvolutionChange {
  const baseline = { version: '1', hash: 'base', resourceId: 'model' }
  return {
    changeId: 'bound',
    contractVersion: 3,
    targetId: 'model',
    requestId: 'req',
    scope: SCOPE,
    jobId: 'job',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    createdBy: 'author',
    baseline,
    strategy: {
      providerKey: 'provider',
      providerVersion: '1',
      hash: 'strategy',
      riskLevel: 'R3',
      definition: direct
        ? evidenceDrivenStrategy({ version: '1', evidenceKinds: ['document'], requiredChecks: [] })
        : FEEDBACK_LEARNING_STRATEGY
    },
    candidate: {
      baseline,
      artifact: { uri: 'candidate', hash: 'bound-hash', schemaVersion: '1', mediaType: 'application/json' },
      changes: [],
      summary: 'Reviewed draft',
      warnings: []
    },
    sourceKind: 'manual',
    learningEventIds: [],
    candidateInput: {},
    datasetSnapshotIds: {},
    stages: [],
    evidence: [],
    evidenceHash: 'evidence',
    status: 'pending_approval',
    evaluation: {
      candidateHash: 'bound-hash',
      runId: 'bound-run',
      strategyHash: 'strategy',
      baselineHash: 'base',
      evidenceHash: 'evidence',
      datasetHash: 'dataset',
      datasetVersion: '1',
      checks: [],
      readiness: [],
      passed: true,
      completedAt: '2026-01-01'
    }
  }
}
function lifecycle(c: EvolutionChange): EvolutionLifecycleRecord {
  return {
    id: c.changeId,
    targetId: c.targetId,
    title: c.changeId,
    scope: SCOPE,
    phase: 'review',
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    strategy: c.strategy,
    stages: [],
    sourceKind: 'manual',
    publicationStatus: 'review',
    effectStatus: 'pending',
    baseline: c.baseline,
    candidate: c.candidate,
    evaluation: c.evaluation,
    approvals: c.approval ? [c.approval] : [],
    capabilities: {
      stagedRollout: c.strategy.definition.publication.mode === 'staged_rollout',
      decide: c.status === 'pending_approval',
      evaluate: false,
      publish: c.status === 'approved'
    }
  }
}
async function setup(direct: boolean) {
  let c = makeChange(direct)
  const api = {
    decideChange: jest.fn(
      (
        id: string,
        body: { candidateHash: string; evaluationRunId: string; decision: 'rejected' | 'approved'; reason: string }
      ) => {
        c = {
          ...c,
          status: body.decision,
          approval: {
            ...body,
            candidateId: id,
            scope: SCOPE,
            strategyHash: 'strategy',
            actorId: 'me',
            actorRole: 'administrator',
            decidedAt: '2026-01-02',
            approvalId: 'abc'
          }
        }
        return of(lifecycle(c))
      }
    ),
    publishChange: jest.fn(() => {
      c = {
        ...c,
        status: 'published',
        ...(direct
          ? {
              receipt: {
                receiptId: 'written',
                changeId: c.changeId,
                candidateHash: 'bound-hash',
                approvalId: 'abc',
                resource: { resourceId: 'model', version: '2', hash: 'bound-hash' },
                completedAt: '2026-01-02'
              }
            }
          : {})
      }
      return of({ ...lifecycle(c), releasePackageId: direct ? undefined : 'package' })
    })
  }
  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), EvolutionApprovalComponent],
    providers: [
      provideRouter([{ path: 'evaluation/approval/:changeId', component: EvolutionApprovalComponent }]),
      { provide: AgentEvolutionApiService, useValue: api },
      {
        provide: Store,
        useValue: {
          selectActiveScope: () => of('organization'),
          activeScope: 'organization',
          hasPermission: () => true,
          userId: 'me',
          userRolePermissions$: of([])
        }
      }
    ]
  }).compileComponents()
  const t = TestBed.inject(TranslateService)
  t.setTranslation('en', english)
  t.use('en')
  const facade = TestBed.inject(AgentEvolutionFacade)
  const update = (x: EvolutionChange) => {
    c = x
    facade.changes.set([c])
    facade.lifecycleRecords.set([
      { ...lifecycle(c), releasePackageId: c.status === 'published' && !direct ? 'package' : undefined }
    ])
  }
  jest.spyOn(facade, 'load').mockImplementation(async () => {
    update(c)
    return null
  })
  update(c)
  const router = await RouterTestingHarness.create()
  await router.navigateByUrl(route, EvolutionApprovalComponent)
  const element = router.routeNativeElement!
  const button = (text: string) =>
    Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!
  const fill = (text: string) => {
    const input = element.querySelector('textarea')!
    input.value = text
    input.dispatchEvent(new Event('input'))
    router.detectChanges()
  }
  const decision = jest.spyOn(facade, 'decideChange')
  const pack = jest.spyOn(facade, 'packageRelease')
  const click = async (text: string) => {
    const b = button(text)
    expect(b.disabled).toBe(false)
    b.click()
    await (text === 'Create release package' ? pack : decision).mock.results.at(-1)?.value
    await router.fixture.whenStable()
    router.detectChanges()
  }
  return { api, element, button, fill, click, update, router, original: c }
}

it.each(['direct', 'staged', 'reject'] as const)(
  'submits the %s decision from the review form and exposes only its real next step',
  async (mode) => {
    const { api, element, button, fill, click } = await setup(mode === 'direct')
    const primary = mode === 'direct' ? 'Approve and write business version' : 'Approve candidate'
    fill('   ')
    expect(button(primary).disabled).toBe(true)
    expect(button('Reject candidate').disabled).toBe(true)
    fill(' Checked evidence ')
    await click(mode === 'reject' ? 'Reject candidate' : primary)
    expect(api.decideChange).toHaveBeenCalledWith('bound', {
      candidateHash: 'bound-hash',
      evaluationRunId: 'bound-run',
      decision: mode === 'reject' ? 'rejected' : 'approved',
      reason: 'Checked evidence'
    })
    expect(element.querySelector('textarea')).toBeNull()
    if (mode === 'direct') {
      expect(api.publishChange).toHaveBeenCalledWith('bound')
      expect(element.textContent).toContain('Business version 2 has been written')
    } else if (mode === 'staged') {
      expect(api.publishChange).not.toHaveBeenCalled()
      await click('Create release package')
      expect(api.publishChange).toHaveBeenCalledWith('bound')
      expect(element.querySelector('a[href*="/agent-evolution/release"]')).toBeTruthy()
    } else {
      expect(api.publishChange).not.toHaveBeenCalled()
      expect(element.textContent).toContain('cannot be published or packaged')
      expect(button('Create release package')).toBeUndefined()
    }
  }
)
it('invalidates the draft when the bound assessment changes even if the candidate id is unchanged', async () => {
  const { original, update, fill, element, router, button } = await setup(false)
  fill('For the old assessment')
  update({ ...original, evaluation: { ...original.evaluation!, runId: 'new-run' } })
  router.detectChanges()
  expect(element.querySelector('textarea')?.value).toBe('')
  expect(button('Approve candidate').disabled).toBe(true)
})
