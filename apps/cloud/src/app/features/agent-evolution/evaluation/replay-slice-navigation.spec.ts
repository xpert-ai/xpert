import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { of } from 'rxjs'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { HistoricalRunComponent } from './historical-run.component'

jest.mock('@cloud/app/@core/state', () => ({ injectActiveScope: () => () => 'org' }))
jest.mock('../agent-evolution.facade', () => ({ AgentEvolutionFacade: class {} }))

const slice = 'held-out'
const scope = { type: 'organization', key: 'org' }
const miss = 'I declined a refund. When will my parcel arrive?'
const flags = (caseId: string, measured: boolean, passed: boolean) => ({
  caseId,
  baselinePassed: false,
  candidatePassed: passed,
  severeError: !measured,
  observations: measured ? [{ slice }, { slice }] : [],
  baselineOutput: { intent: 'other' },
  candidateOutput: { intent: passed ? 'order_status' : 'other' },
  expectedOutput: { intent: 'order_status' },
  latencyMs: 1
})
const results = [
  flags('duplicate', false, false),
  ...Array.from({ length: 5 }, (_, i) => flags('improved-' + i, true, true)),
  flags('duplicate', true, false)
]
const run = {
  runId: 'recorded-run',
  targetId: 'router',
  scope,
  datasetSnapshotId: 'frozen',
  sliceMetrics: [{ slice, totalCases: 6 }],
  caseResults: results
}
const snapshot = {
  snapshotId: 'frozen',
  targetId: 'router',
  scope,
  name: 'Original snapshot',
  cases: results.map((r, i) => ({
    caseId: r.caseId,
    revision: i + 1,
    slice,
    risk: 'medium',
    input: { utterance: i === 6 ? miss : 'Another revision' }
  }))
}
const page = (items: unknown[]) => of({ items, total: items.length, page: 1, pageSize: 20 })
const path = '/agent-evolution/evaluations/recorded-run?slice=held-out'

describe('scoped replay case navigation', () => {
  const listDatasets = jest.fn()
  beforeEach(() => {
    listDatasets.mockReset().mockReturnValue(page([snapshot]))
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter([{ path: 'agent-evolution/evaluations/:resourceId', component: HistoricalRunComponent }]),
        {
          provide: AgentEvolutionApiService,
          useValue: {
            listEvaluations: () => page([run]),
            listDatasets,
            listTargets: () => page([{ targetId: 'router', replaySlices: [{ key: slice, label: 'Order tracking' }] }])
          }
        },
        { provide: AgentEvolutionFacade, useValue: {} }
      ]
    })
    TestBed.inject(TranslateService).use('en')
  })
  it('filters only measured rows, keeps the original revision index and restores the filtered list', async () => {
    const harness = await RouterTestingHarness.create(path)
    const element: HTMLElement = harness.routeNativeElement!
    const button = (text: string) =>
      Array.from(element.querySelectorAll('button')).find((b) => b.textContent.includes(text))!
    expect(element.textContent).toContain('Order tracking')
    expect(button('.all 6')).toBeDefined()
    expect(button('.severe')).toBeUndefined()
    button('.failed 1').click()
    harness.detectChanges()
    expect(element.querySelectorAll('tbody tr')).toHaveLength(1)
    button('.ViewCase').click()
    await harness.fixture.whenStable()
    harness.detectChanges()
    expect(TestBed.inject(Router).url).toContain('caseIndex=6')
    expect(element.textContent).toContain(miss)
    expect(element.textContent).not.toContain('Another revision')
    expect(element.textContent).toContain('order_status')
    expect(element.textContent).toContain('other')
    button('.BackResult').click()
    await harness.fixture.whenStable()
    harness.detectChanges()
    expect(button('.failed 1').getAttribute('aria-pressed')).toBe('true')
    expect(element.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(listDatasets).toHaveBeenCalledTimes(1)
    await harness.navigateByUrl(path + '&caseId=duplicate&caseIndex=0')
    expect(element.textContent).toContain('.Unavailable')
    expect(element.textContent).not.toContain('Another revision')
  })
  it('keeps an unknown group empty and never substitutes a different scope’s snapshot', async () => {
    const harness = await RouterTestingHarness.create(path + '-absent')
    const element: HTMLElement = harness.routeNativeElement!
    expect(element.textContent).toContain('.sliceMissing')
    expect(listDatasets).not.toHaveBeenCalled()
    listDatasets.mockReturnValue(page([{ ...snapshot, scope: { ...scope, key: 'other-org' } }]))
    await harness.navigateByUrl(path + '&caseId=duplicate&caseIndex=6')
    expect(element.textContent).toContain('.SnapshotMissing')
    expect(element.textContent).not.toContain(miss)
  })
})
