import { Dialog } from '@angular/cdk/dialog'
import { HttpErrorResponse } from '@angular/common/http'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, of, Subject } from 'rxjs'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { DeploymentHistoryComponent } from './deployment-history.component'

jest.mock('@cloud/app/@core/state', () => ({
  injectActiveScope: () => () => ({ level: 'organization', organizationId: 'local' })
}))
jest.mock('../agent-evolution.facade', () => ({ AgentEvolutionFacade: class {} }))

describe('deployment history lookup', () => {
  const scope = { type: 'organization', key: 'local' }
  const stage = {
    deploymentId: 'stage50',
    releasePackageId: 'pack',
    scope,
    channel: 'canary',
    dataSource: 'runtime_telemetry',
    startedAt: '2026-05-04T12:00:00Z',
    canaryPercent: 50,
    sampleCount: 5,
    severeErrors: 0,
    candidateAccuracy: 1
  }
  const release = { releasePackageId: 'pack', candidateId: 'change', targetId: 'target', scope }
  const records = signal([{ id: 'change', targetId: 'target', releasePackageId: 'pack', scope }])
  const navigate = jest.fn()
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>, response: Subject<unknown>
  const read = jest.fn()
  beforeEach(() => {
    records.set([{ id: 'change', targetId: 'target', releasePackageId: 'pack', scope }])
    response = new Subject()
    read.mockReset().mockReturnValue(response)
    navigate.mockClear()
    query = new BehaviorSubject(convertToParamMap({}))
    const params = convertToParamMap({ resourceId: 'stage50' })
    TestBed.configureTestingModule({
      imports: [DeploymentHistoryComponent, TranslateModule.forRoot()],
      providers: [
        { provide: Dialog, useValue: {} },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: params, queryParamMap: query.value },
            paramMap: of(params),
            queryParamMap: query
          }
        },
        {
          provide: AgentEvolutionApiService,
          useValue: {
            listDeployments: read,
            listReleaseObservations: () => of({ items: [], total: 0, page: 1, pageSize: 100 }),
            listCanaryTestOverrides: () => of([])
          }
        },
        {
          provide: AgentEvolutionFacade,
          useValue: {
            loadedAt: signal(new Date()),
            dashboard: () => ({ deployments: [], releases: [release] }),
            visibleTargets: () => [{ targetId: 'target' }],
            lifecycleRecords: records
          }
        }
      ]
    }).overrideComponent(DeploymentHistoryComponent, { set: { template: '', imports: [] } })
  })
  it('pins the requested stage when newer production exists for the same release', () => {
    const f = TestBed.createComponent(DeploymentHistoryComponent)
    f.detectChanges()
    response.next({
      items: [{ ...stage, deploymentId: 'production', channel: 'production' }, stage],
      total: 2,
      page: 1,
      pageSize: 20
    })
    response.complete()
    f.detectChanges()
    expect(navigate).toHaveBeenCalledWith(['/agent-evolution/release'], {
      replaceUrl: true,
      queryParams: { target: 'target', changeId: 'change', view: 'observations', stage: 'stage50' }
    })
  })
  it('keeps a readable deployment available without a linked lifecycle record', () => {
    records.set([])
    const f = TestBed.createComponent(DeploymentHistoryComponent)
    f.detectChanges()
    response.next({ items: [stage], total: 1, page: 1, pageSize: 20 })
    response.complete()
    f.detectChanges()
    expect(f.componentInstance.stage()?.deploymentId).toBe('stage50')
    expect(f.componentInstance.linked()).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
  it.each([
    [403, 'denied'],
    [500, 'failed']
  ])('shows an explicit state on HTTP %s', (status, expected) => {
    const f = TestBed.createComponent(DeploymentHistoryComponent)
    f.detectChanges()
    response.error(new HttpErrorResponse({ status: Number(status) }))
    f.detectChanges()
    expect(f.componentInstance.lookup().status).toBe(expected)
    expect(navigate).not.toHaveBeenCalled()
  })
})
