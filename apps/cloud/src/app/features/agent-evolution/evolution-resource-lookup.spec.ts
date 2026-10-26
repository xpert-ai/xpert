import { TestBed } from '@angular/core/testing'
import { firstValueFrom, of, Subject } from 'rxjs'
import { AgentEvolutionApiService } from './agent-evolution-api.service'
import { findEvolutionResource, findLearningEvent } from './evolution-resource-lookup'
import type { EvolutionPage, EvolutionTargetDescriptor } from '@xpert-ai/contracts'

describe('search destination lookup beyond dashboard pages', () => {
  const targets = jest.fn()
  const events = jest.fn()
  let api: AgentEvolutionApiService
  beforeEach(() => {
    jest.resetAllMocks()
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AgentEvolutionApiService,
          useValue: {
            listTargets: targets,
            listLearningEvents: events
          }
        }
      ]
    })
    api = TestBed.inject(AgentEvolutionApiService)
  })
  it('resolves the exact target across matching pages instead of returning a prefix match', async () => {
    targets
      .mockReturnValueOnce(of({ items: [{ targetId: 'wanted-prefix' }], page: 1, pageSize: 1, total: 2 }))
      .mockReturnValueOnce(
        of({ items: [{ targetId: 'wanted', displayName: 'Found' }], page: 2, pageSize: 1, total: 2 })
      )
    expect(await firstValueFrom(findEvolutionResource(api, 'target', 'wanted'))).toEqual({
      targetId: 'wanted',
      displayName: 'Found'
    })
    expect(targets).toHaveBeenLastCalledWith({ page: 2, pageSize: 20, search: 'wanted' })
  })
  it('returns missing and cancels a pending page when the destination or scope changes', async () => {
    targets.mockReturnValue(of({ items: [], total: 0, page: 1, pageSize: 20 }))
    expect(await firstValueFrom(findEvolutionResource(api, 'target', 'missing'))).toBeNull()
    const pending = new Subject<EvolutionPage<EvolutionTargetDescriptor>>()
    targets.mockReturnValue(pending)
    const subscription = findEvolutionResource(api, 'target', 'pending').subscribe()
    expect(pending.observed).toBe(true)
    subscription.unsubscribe()
    expect(pending.observed).toBe(false)
  })
  it('retrieves ignored learning results without depending on current dashboard target filters', async () => {
    events.mockReturnValue(
      of({ items: [{ eventId: 'event', reviewStatus: 'ignored' }], page: 1, pageSize: 20, total: 1 })
    )
    expect(await firstValueFrom(findLearningEvent(api, 'event'))).toEqual({ eventId: 'event', reviewStatus: 'ignored' })
  })
})
