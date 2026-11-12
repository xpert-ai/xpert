import { HttpErrorResponse } from '@angular/common/http'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router'
import { of, Subject } from 'rxjs'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { HistoricalRunComponent } from './historical-run.component'

jest.mock('@cloud/app/@core/state', () => ({
  injectActiveScope: () => () => ({ level: 'organization', organizationId: 'local' })
}))
jest.mock('../agent-evolution.facade', () => ({ AgentEvolutionFacade: class {} }))

describe('historical replay links', () => {
  const candidate = {
    candidateId: 'candidate',
    targetId: 'target',
    targetScope: { type: 'organization', key: 'local' }
  }
  const historical = {
    evaluatorKind: 'golden_replay',
    runId: 'older',
    candidateId: 'candidate',
    targetId: 'target',
    scope: candidate.targetScope,
    datasetSnapshotId: 'original-snapshot',
    baselineBundle: { items: [] },
    candidateBundle: { items: [] },
    metrics: {
      totalCases: 62,
      passedCases: 62,
      baselineAccuracy: 1,
      candidateAccuracy: 1,
      accuracyDelta: 0,
      severeErrors: 0
    },
    gate: { passed: false, decision: 'reject', blockingReasons: ['candidate_does_not_improve_baseline'] },
    caseResults: []
  }
  const latest = { ...historical, runId: 'latest', datasetSnapshotId: 'new-snapshot' }
  const candidates = signal([candidate]),
    records = signal([latest, historical])
  const navigate = jest.fn()
  let page: Subject<unknown>
  beforeEach(() => {
    candidates.set([candidate])
    records.set([latest, historical])
    navigate.mockClear()
    page = new Subject()
    const params = convertToParamMap({ resourceId: 'older' }),
      query = convertToParamMap({ from: 'overview', historyTarget: 'all' })
    TestBed.configureTestingModule({
      imports: [HistoricalRunComponent],
      providers: [
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: params, queryParamMap: query },
            paramMap: of(params),
            queryParamMap: of(query)
          }
        },
        { provide: AgentEvolutionApiService, useValue: { listEvaluations: () => page } },
        {
          provide: AgentEvolutionFacade,
          useValue: {
            loadedAt: signal(new Date()),
            loading: signal(false),
            dashboard: () => ({ candidates: candidates(), evaluations: records() }),
            visibleTargets: () => [{ targetId: 'target' }]
          }
        }
      ]
    }).overrideComponent(HistoricalRunComponent, { set: { template: '', imports: [] } })
  })
  function start() {
    const fixture = TestBed.createComponent(HistoricalRunComponent)
    fixture.detectChanges()
    return fixture
  }
  it('opens the exact recorded run even if the candidate has a newer evaluation', () => {
    const fixture = start()
    page.next({ items: [latest, historical], total: 2, page: 1, pageSize: 20 })
    page.complete()
    fixture.detectChanges()
    expect(navigate).toHaveBeenCalledWith(['/agent-evolution/evaluation'], {
      replaceUrl: true,
      queryParams: expect.objectContaining({
        target: 'target',
        changeId: 'candidate',
        runId: 'older',
        historyTarget: 'all',
        from: 'overview'
      })
    })
  })
  it('retains the original payload when no corresponding candidate is available', () => {
    candidates.set([])
    const fixture = start()
    page.next({ items: [historical], total: 1, page: 1, pageSize: 20 })
    page.complete()
    fixture.detectChanges()
    expect(fixture.componentInstance.lookup().run?.datasetSnapshotId).toBe('original-snapshot')
    expect(navigate).not.toHaveBeenCalled()
  })
  it.each([
    [403, 'denied'],
    [500, 'failed']
  ])('distinguishes HTTP %s from an absent run', (status, state) => {
    const fixture = start()
    page.error(new HttpErrorResponse({ status: Number(status) }))
    fixture.detectChanges()
    expect(fixture.componentInstance.lookup().status).toBe(state)
    expect(navigate).not.toHaveBeenCalled()
  })
})
