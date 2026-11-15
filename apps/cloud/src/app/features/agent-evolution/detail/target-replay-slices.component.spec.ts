import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'
import { TargetReplaySlicesComponent } from './target-replay-slices.component'

const mockScope = signal('first-org')
jest.mock('@cloud/app/@core/state', () => ({ injectActiveScope: () => mockScope }))

it('renders paired slice rates from one scoped run and distinguishes unmeasured runs from zero accuracy', async () => {
  const first = new Subject<unknown>(),
    second = new Subject<unknown>(),
    third = new Subject<unknown>()
  const listEvaluations = jest.fn().mockReturnValueOnce(first).mockReturnValueOnce(second).mockReturnValueOnce(third)
  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), TargetReplaySlicesComponent],
    providers: [provideRouter([]), { provide: AgentEvolutionApiService, useValue: { listEvaluations } }]
  }).compileComponents()
  TestBed.inject(TranslateService).use('en')
  const fixture = TestBed.createComponent(TargetReplaySlicesComponent)
  const element: HTMLElement = fixture.nativeElement
  const cells = () => Array.from(element.querySelectorAll('tbody tr > *'), (cell) => cell.textContent.trim())
  fixture.componentRef.setInput('target', {
    targetId: 'router',
    replaySlices: [{ key: 'sample', label: 'Held-out cases' }]
  })
  fixture.detectChanges()
  expect(listEvaluations).toHaveBeenCalledWith({ targetId: 'router', pageSize: 1, sort: 'createdAt', order: 'DESC' })
  const run = {
    targetId: 'router',
    runId: 'first',
    sliceMetrics: [
      { slice: 'other', totalCases: 100, baselineAccuracy: 1, candidateAccuracy: 1 },
      { slice: 'sample', totalCases: 6, baselineAccuracy: 0, candidateAccuracy: 5 / 6 }
    ]
  }
  first.next({ items: [run] })
  fixture.detectChanges()
  expect(cells()).toEqual(['Held-out cases', '6', '0%', '83.3%'])
  expect(element.querySelector('a')?.getAttribute('href')).toBe('/agent-evolution/evaluations/first')
  mockScope.set('second-org')
  fixture.detectChanges()
  first.next({ items: [run] })
  expect(cells()).toEqual([])
  second.next({ items: [{ targetId: 'router', runId: 'legacy' }] })
  fixture.detectChanges()
  expect(cells()).toEqual(['Held-out cases', '—', '—', '—'])
  second.next({
    items: [
      { ...run, sliceMetrics: [{ slice: 'sample', totalCases: 0, baselineAccuracy: null, candidateAccuracy: null }] }
    ]
  })
  fixture.detectChanges()
  expect(cells()).toEqual(['Held-out cases', '0', '—', '—'])
  fixture.componentRef.setInput('target', { targetId: 'new', replaySlices: [{ key: 'slice-b', label: 'New group' }] })
  fixture.detectChanges()
  third.error(new Error('failed'))
  fixture.detectChanges()
  expect(element.querySelector('[role="alert"]')).not.toBeNull()
  expect(element.querySelector('a')).toBeNull()
})
