jest.mock('../../../@core', () => {
  const contracts = jest.requireActual('@xpert-ai/contracts')
  return {
    AssistantBindingService: class AssistantBindingService {},
    AssistantBindingScope: contracts.AssistantBindingScope,
    AssistantCode: contracts.AssistantCode,
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : '')
  }
})
jest.mock('./clawxpert-bootstrap.service', () => ({ ClawXpertBootstrapService: class ClawXpertBootstrapService {} }))

import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { AssistantBindingScope, AssistantCode, IAssistantBinding, IXpert, XpertTypeEnum } from '@xpert-ai/contracts'
import { Subject } from 'rxjs'
import { AssistantBindingService } from '../../../@core'
import { ClawXpertBindingState } from './clawxpert-binding-state'
import { ClawXpertBootstrapService } from './clawxpert-bootstrap.service'
import { ClawXpertConfigurationCache } from './clawxpert-configuration-cache.service'

const scope = { userId: 'user-1', organizationId: 'org-1' }
const binding = (id = 'xpert-1'): IAssistantBinding => ({
  code: AssistantCode.CLAWXPERT,
  scope: AssistantBindingScope.USER,
  assistantId: id
})
const xpert = (id = 'xpert-1', title = 'Cached assistant'): IXpert => ({
  id,
  name: id,
  slug: id,
  type: XpertTypeEnum.Agent,
  latest: true,
  title
})
const flushRequests = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('ClawXpertBindingState', () => {
  let cache: ClawXpertConfigurationCache
  let bindingResponse: Subject<IAssistantBinding | null>
  let xpertsResponse: Subject<IXpert[]>
  let service: { get: jest.Mock; getAvailableXperts: jest.Mock }
  let context: {
    userId: ReturnType<typeof signal<string | null>>
    organizationId: ReturnType<typeof signal<string | null>>
    currentUrl: ReturnType<typeof signal<string>>
  }

  const createState = () => TestBed.runInInjectionContext(() => new ClawXpertBindingState(context))

  beforeEach(() => {
    localStorage.clear()
    bindingResponse = new Subject()
    xpertsResponse = new Subject()
    service = {
      get: jest.fn(() => bindingResponse),
      getAvailableXperts: jest.fn(() => xpertsResponse)
    }
    context = {
      userId: signal(scope.userId),
      organizationId: signal(scope.organizationId),
      currentUrl: signal('/chat/clawxpert/c')
    }
    TestBed.configureTestingModule({
      teardown: { destroyAfterEach: true },
      providers: [
        { provide: AssistantBindingService, useValue: service },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
        {
          provide: ClawXpertBootstrapService,
          useValue: {
            pendingCreatedClawXpert: signal(null),
            clearPendingCreatedClawXpert: jest.fn()
          }
        }
      ]
    })
    cache = TestBed.inject(ClawXpertConfigurationCache)
  })
  afterEach(() => {
    TestBed.resetTestingModule()
    localStorage.clear()
  })

  it('renders cached configuration before effects run and refreshes without blocking the page', async () => {
    cache.save(scope, binding(), [xpert()])
    const state = createState()
    expect(service.get).not.toHaveBeenCalled()
    expect(state.loading()).toBe(false)
    expect(state.hasLoadedXperts()).toBe(true)
    expect(state.availableXperts()[0].title).toBe('Cached assistant')

    TestBed.tick()
    expect(service.get).toHaveBeenCalledTimes(1)
    expect(state.loading()).toBe(false)
    bindingResponse.next(binding())
    await flushRequests()
    expect(state.availableXperts()[0].title).toBe('Cached assistant')

    xpertsResponse.next([xpert('xpert-1', 'Updated assistant')])
    await flushRequests()
    expect(state.availableXperts()[0].title).toBe('Updated assistant')
    expect(state.loading()).toBe(false)
    expect(cache.load(scope)?.xpert.title).toBe('Updated assistant')
    expect(createState().availableXperts()[0].title).toBe('Updated assistant')
  })

  it('keeps the first uncached visit loading until both requests finish', async () => {
    const state = createState()
    expect(state.loading()).toBe(true)
    TestBed.tick()
    bindingResponse.next(binding())
    await flushRequests()
    expect(state.loading()).toBe(true)
    xpertsResponse.next([xpert()])
    await flushRequests()
    expect(state.loading()).toBe(false)
    expect(state.showWizard()).toBe(false)
    expect(cache.load(scope)?.preference.assistantId).toBe('xpert-1')
  })

  it('keeps an explicitly opened binding wizard open during background refresh', async () => {
    cache.save(scope, binding(), [xpert()])
    const state = createState()
    TestBed.tick()
    state.showWizard.set(true)
    bindingResponse.next(binding())
    xpertsResponse.next([xpert()])
    await flushRequests()
    expect(state.showWizard()).toBe(true)
  })

  it.each(['unbound', 'unavailable'])(
    'discards the cached binding when the server reports it is %s',
    async (reason) => {
      cache.save(scope, binding(), [xpert()])
      const state = createState()
      TestBed.tick()
      bindingResponse.next(reason === 'unbound' ? null : binding())
      xpertsResponse.next(reason === 'unavailable' ? [] : [xpert()])
      await flushRequests()
      expect(state.showWizard()).toBe(true)
      expect(state.loading()).toBe(false)
      expect(cache.load(scope)).toBeNull()
    }
  )

  it('keeps the last usable configuration after a temporary refresh failure', async () => {
    cache.save(scope, binding(), [xpert()])
    const state = createState()
    TestBed.tick()
    bindingResponse.error({ status: 503 })
    await flushRequests()
    expect(state.preference()?.assistantId).toBe('xpert-1')
    expect(state.errorMessage()).toBeNull()
    expect(state.loading()).toBe(false)
    expect(cache.load(scope)).not.toBeNull()
  })

  it.each([401, 403, 404])('discards cached state after access is rejected (%s)', async (status) => {
    cache.save(scope, binding(), [xpert()])
    const state = createState()
    TestBed.tick()
    xpertsResponse.error({ status })
    await flushRequests()
    expect(state.preference()).toBeNull()
    expect(state.availableXperts()).toEqual([])
    expect(state.errorMessage()).not.toBeNull()
    expect(state.loading()).toBe(false)
    expect(cache.load(scope)).toBeNull()
  })

  it.each(['userId', 'organizationId'] as const)(
    'isolates cache hydration and ignores old requests when %s changes',
    async (key) => {
      cache.save(scope, binding(), [xpert()])
      const nextScope = { ...scope, [key]: 'another-owner' }
      cache.save(nextScope, binding('xpert-2'), [xpert('xpert-2')])
      const state = createState()
      TestBed.tick()
      const nextBinding = new Subject<IAssistantBinding | null>()
      const nextXperts = new Subject<IXpert[]>()
      service.get.mockReturnValue(nextBinding)
      service.getAvailableXperts.mockReturnValue(nextXperts)
      context[key].set('another-owner')
      TestBed.tick()
      expect(state.preference()?.assistantId).toBe('xpert-2')
      expect(state.loading()).toBe(false)

      bindingResponse.next(binding())
      xpertsResponse.next([xpert('xpert-1', 'Stale response')])
      await flushRequests()
      expect(state.preference()?.assistantId).toBe('xpert-2')
      expect(cache.load(scope)?.xpert.title).toBe('Cached assistant')
      expect(cache.load(nextScope)?.xpert.id).toBe('xpert-2')

      nextBinding.next(binding('xpert-2'))
      nextXperts.next([xpert('xpert-2', 'New owner refreshed')])
      await flushRequests()
      expect(cache.load(nextScope)?.xpert.title).toBe('New owner refreshed')
    }
  )

  it('clears the previous configuration when switching to an uncached organization', () => {
    cache.save(scope, binding(), [xpert()])
    const state = createState()
    TestBed.tick()
    context.organizationId.set('org-2')
    TestBed.tick()
    expect(state.preference()).toBeNull()
    expect(state.availableXperts()).toEqual([])
    expect(state.loading()).toBe(true)
  })

  it.each([true, false])(
    'does not overwrite a completed user change with an older refresh (bound: %s)',
    async (bound) => {
      cache.save(scope, binding(), [xpert()])
      const state = createState()
      TestBed.tick()
      state.commit(bound ? binding('xpert-2') : null, [xpert('xpert-2')])
      bindingResponse.next(binding())
      xpertsResponse.next([xpert()])
      await flushRequests()
      expect(state.preference()?.assistantId ?? null).toBe(bound ? 'xpert-2' : null)
      expect(cache.load(scope)?.preference.assistantId ?? null).toBe(bound ? 'xpert-2' : null)
    }
  )

  it('does not let a destroyed page overwrite the next visit cache', async () => {
    const state = createState()
    TestBed.tick()
    TestBed.resetTestingModule()
    bindingResponse.next(binding())
    xpertsResponse.next([xpert()])
    await flushRequests()
    expect(state.preference()).toBeNull()
    expect(cache.load(scope)).toBeNull()
  })
})
