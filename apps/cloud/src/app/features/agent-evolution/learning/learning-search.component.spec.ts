import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { Store } from '@cloud/app/@core/state'
import { ZardDialogService } from '@xpert-ai/headless-ui'
import { BehaviorSubject, of, Subject, throwError } from 'rxjs'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { AgentEvolutionLearningComponent } from './learning.component'

jest.mock('../agent-evolution.facade', () => ({ AgentEvolutionFacade: class {} }))
describe('learning review navigation', () => {
  const params = new BehaviorSubject(convertToParamMap({ eventId: 'older-event' }))
  const events = jest.fn(),
    proposals = jest.fn(),
    review = jest.fn()
  const result = (status: string) => ({
    items: [{ event: { eventId: 'older-event', reviewStatus: status }, proposalCount: 0 }],
    page: 1,
    pageSize: 5,
    total: 1,
    scopeTotal: 295
  })
  beforeEach(() => {
    jest.resetAllMocks()
    params.next(convertToParamMap({ eventId: 'older-event' }))
    events.mockReturnValue(of(result('pending')))
    proposals.mockReturnValue(of({ items: [], page: 1, pageSize: 1, total: 0, scopeTotal: 3 }))
    review.mockResolvedValue(true)
    TestBed.configureTestingModule({
      imports: [AgentEvolutionLearningComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ActivatedRoute, useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } } },
        { provide: Router, useValue: {} },
        { provide: ZardDialogService, useValue: {} },
        {
          provide: Store,
          useValue: { activeScope: { level: 'organization' }, selectActiveScope: () => of({ level: 'organization' }) }
        },
        { provide: AgentEvolutionApiService, useValue: { learningReview: events, learningProposals: proposals } },
        {
          provide: AgentEvolutionFacade,
          useValue: {
            selectedTargetId: signal('all'),
            showFixtures: signal(false),
            loadedAt: signal(null),
            visibleTargets: signal([]),
            mutating: signal(false),
            reviewEvent: review
          }
        }
      ]
    }).overrideComponent(AgentEvolutionLearningComponent, { set: { template: '', imports: [] } })
  })
  async function setup() {
    const fixture = TestBed.createComponent(AgentEvolutionLearningComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    return { fixture, c: fixture.componentInstance }
  }
  it('resolves an exact event beyond the first dashboard page and reloads its review mark', async () => {
    const { c, fixture } = await setup()
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'older-event' }))
    const row = c.state().data!.events.items[0]
    events.mockReturnValue(of(result('golden')))
    await c.review(row.event, 'golden')
    fixture.detectChanges()
    await fixture.whenStable()
    expect(review).toHaveBeenCalledWith('older-event', 'golden')
    expect(c.state().data!.events.items[0].event.reviewStatus).toBe('golden')
  })
  it('distinguishes a failed lookup from an empty result and retries', async () => {
    events.mockReturnValue(throwError(() => new Error('offline')))
    const { c, fixture } = await setup()
    expect(c.state().error).toBe(true)
    events.mockReturnValue(of({ ...result('pending'), items: [], total: 0 }))
    c.revision.update((n) => n + 1)
    fixture.detectChanges()
    await fixture.whenStable()
    expect(c.state().error).toBe(false)
    expect(c.state().data!.events.total).toBe(0)
  })
  it('cancels an obsolete lookup and requests only the cited proposal revision', async () => {
    const pending = new Subject()
    events.mockReturnValue(pending)
    const { c, fixture } = await setup()
    expect(pending.observed).toBe(true)
    events.mockReturnValue(of(result('pending')))
    params.next(convertToParamMap({ citedBy: 'proposal', revision: '2' }))
    fixture.detectChanges()
    await fixture.whenStable()
    expect(pending.observed).toBe(false)
    expect(events).toHaveBeenLastCalledWith(expect.objectContaining({ proposalId: 'proposal', revision: 2 }))
    expect(c.view()).toBe('feedback')
  })
})
