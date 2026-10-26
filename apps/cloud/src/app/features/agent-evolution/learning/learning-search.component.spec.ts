import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { Store } from '@cloud/app/@core/state'
import { ZardAlertDialogService } from '@xpert-ai/headless-ui'
import { BehaviorSubject, of, Subject, throwError } from 'rxjs'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { AgentEvolutionLearningComponent } from './learning.component'

jest.mock('../agent-evolution.facade', () => ({ AgentEvolutionFacade: class {} }))

describe('learning search destination', () => {
  const query = new BehaviorSubject(convertToParamMap({ eventId: 'older-event' }))
  const list = jest.fn()
  const review = jest.fn()
  const event = (reviewStatus: string) => ({ eventId: 'older-event', reviewStatus, targetId: 'target' })
  const page = (reviewStatus: string) => ({ items: [event(reviewStatus)], page: 1, pageSize: 20, total: 1 })

  beforeEach(() => {
    jest.resetAllMocks()
    query.next(convertToParamMap({ eventId: 'older-event' }))
    list.mockReturnValue(of(page('pending')))
    review.mockResolvedValue(true)
    TestBed.configureTestingModule({
      imports: [AgentEvolutionLearningComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ActivatedRoute, useValue: { queryParamMap: query } },
        {
          provide: Store,
          useValue: { activeScope: { level: 'organization' }, selectActiveScope: () => of({ level: 'organization' }) }
        },
        { provide: AgentEvolutionApiService, useValue: { listLearningEvents: list } },
        { provide: ZardAlertDialogService, useValue: {} },
        {
          provide: AgentEvolutionFacade,
          useValue: {
            contextEvents: signal([]),
            contextProposals: signal([]),
            dashboard: signal({ targets: [], clusters: [] }),
            reviewEvent: review
          }
        }
      ]
    }).overrideComponent(AgentEvolutionLearningComponent, { set: { template: '', imports: [] } })
  })

  it('opens an event outside the dashboard and refreshes it after successful review', async () => {
    const fixture = TestBed.createComponent(AgentEvolutionLearningComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    const component = fixture.componentInstance
    expect(component.selectedEvent()?.eventId).toBe('older-event')
    list.mockReturnValue(of(page('golden')))
    await component.toggleGolden()
    fixture.detectChanges()
    await fixture.whenStable()
    expect(review).toHaveBeenLastCalledWith('older-event', 'golden')
    expect(component.selectedEvent()?.reviewStatus).toBe('golden')
    list.mockReturnValue(of(page('ignored')))
    await component.ignoreSelected()
    fixture.detectChanges()
    await fixture.whenStable()
    expect(component.queueTab()).toBe('ignored')
    expect(component.selectedEvent()?.reviewStatus).toBe('ignored')
  })

  it('distinguishes a failed lookup from no result and supports retry', async () => {
    list.mockReturnValue(throwError(() => new Error('offline')))
    const fixture = TestBed.createComponent(AgentEvolutionLearningComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    expect(fixture.componentInstance.eventLookup().error).toBe(true)
    list.mockReturnValue(of(page('pending')))
    fixture.componentInstance.refreshSearchDestination()
    fixture.detectChanges()
    await fixture.whenStable()
    expect(fixture.componentInstance.eventLookup().error).toBe(false)
    expect(fixture.componentInstance.selectedEvent()?.eventId).toBe('older-event')
  })

  it('cancels a pending destination when navigating to a different event', async () => {
    const pending = new Subject()
    list.mockReturnValue(pending)
    const fixture = TestBed.createComponent(AgentEvolutionLearningComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    expect(pending.observed).toBe(true)
    list.mockReturnValue(of({ items: [], page: 1, pageSize: 20, total: 0 }))
    query.next(convertToParamMap({ eventId: 'another' }))
    fixture.detectChanges()
    await fixture.whenStable()
    expect(pending.observed).toBe(false)
    expect(fixture.componentInstance.selectedEvent()).toBeNull()
  })
})
