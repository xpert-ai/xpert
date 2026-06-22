jest.mock('../../@core', () => ({
  AiFeatureEnum: {
    FEATURE_XPERT: 'FEATURE_XPERT',
    FEATURE_XPERT_CHATBI: 'FEATURE_XPERT_CHATBI',
    FEATURE_XPERT_CLAWXPERT: 'FEATURE_XPERT_CLAWXPERT'
  },
  AssistantBindingScope: {
    USER: 'user'
  },
  AssistantCode: {
    CLAWXPERT: 'clawxpert'
  },
  AssistantBindingService: class AssistantBindingService {},
  Store: class Store {
    organizationId = 'org-1'
    user$ = {
      pipe: () => ({})
    }

    hasFeatureEnabled() {
      return true
    }
  }
}))

jest.mock('./common/common.component', () => ({
  ChatCommonAssistantComponent: class ChatCommonAssistantComponent {}
}))

jest.mock('./xpert/xpert.component', () => ({
  ChatXpertComponent: class ChatXpertComponent {}
}))

jest.mock('./xpert-workbench/xpert-workbench.component', () => ({
  ChatXpertWorkbenchComponent: class ChatXpertWorkbenchComponent {}
}))

jest.mock('./clawxpert/clawxpert.component', () => ({
  ClawXpertComponent: class ClawXpertComponent {}
}))

jest.mock('./clawxpert/clawxpert-overview.component', () => ({
  ClawXpertOverviewComponent: class ClawXpertOverviewComponent {}
}))

jest.mock('./clawxpert/clawxpert-conversation-detail.component', () => ({
  ClawXpertConversationDetailComponent: class ClawXpertConversationDetailComponent {}
}))

jest.mock('./tasks/tasks.component', () => ({
  ChatTasksComponent: class ChatTasksComponent {}
}))

jest.mock('./home/home.component', () => ({
  ChatHomeComponent: class ChatHomeComponent {}
}))

jest.mock('@xpert-ai/cloud/state', () => ({
  CurrentUserHydrationService: class CurrentUserHydrationService {}
}))

import { Injector, runInInjectionContext } from '@angular/core'
import { Route, Router, UrlSegment, UrlSegmentGroup } from '@angular/router'
import { Observable, firstValueFrom, of } from 'rxjs'
import { CurrentUserHydrationService } from '@xpert-ai/cloud/state'
import { routes } from './routes'
import { ChatXpertComponent } from './xpert/xpert.component'
import { ChatXpertWorkbenchComponent } from './xpert-workbench/xpert-workbench.component'
import { ClawXpertConversationDetailComponent } from './clawxpert/clawxpert-conversation-detail.component'
import { ClawXpertComponent } from './clawxpert/clawxpert.component'
import { ClawXpertOverviewComponent } from './clawxpert/clawxpert-overview.component'

const { AssistantBindingService, Store } = jest.requireMock('../../@core') as {
  AssistantBindingService: new (...args: any[]) => unknown
  Store: new (...args: any[]) => unknown
}
describe('chat routes', () => {
  const children = routes[0].children ?? []
  let injector: Injector
  let store: {
    organizationId: string | null
    user$: Observable<{ tenant: { featureOrganizations: unknown[] } }>
    hasFeatureEnabled: jest.Mock
  }
  let assistantBindingService: {
    get: jest.Mock
    getAvailableXperts: jest.Mock
  }
  let router: {
    createUrlTree: jest.Mock
  }
  let currentUserHydrationService: {
    getFeatureHydration: jest.Mock
  }

  beforeEach(() => {
    store = {
      organizationId: 'org-1',
      user$: of({
        tenant: {
          featureOrganizations: []
        }
      }),
      hasFeatureEnabled: jest.fn(() => true)
    }
    assistantBindingService = {
      get: jest.fn(() => of(null)),
      getAvailableXperts: jest.fn(() => of([]))
    }
    router = {
      createUrlTree: jest.fn((commands: string[]) => commands[0])
    }
    currentUserHydrationService = {
      getFeatureHydration: jest.fn().mockResolvedValue({ id: 'user-1' })
    }

    injector = Injector.create({
      providers: [
        { provide: Store, useValue: store },
        { provide: AssistantBindingService, useValue: assistantBindingService },
        { provide: Router, useValue: router },
        { provide: CurrentUserHydrationService, useValue: currentUserHydrationService }
      ]
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('redirects deprecated /chat/x/common to ClawXpert', () => {
    const route = children.find((item) => item.path === 'x/common')

    expect(route?.redirectTo).toBe('/chat/clawxpert')
  })

  it('redirects legacy common conversation urls to ClawXpert', () => {
    const route = children.find((item) => item.path === 'x/common/c/:id')

    expect(route?.redirectTo).toBe('/chat/clawxpert')
  })

  it('redirects /chat/x/welcome to ClawXpert', () => {
    const route = children.find((item) => item.path === 'x/welcome')

    expect(route?.redirectTo).toBe('/chat/clawxpert')
  })

  it('keeps /chat/c/:id on the legacy chat xpert component', () => {
    const route = children.find((item) => item.path === 'c/:id')

    expect(route?.component).toBe(ChatXpertComponent)
  })

  it('routes direct xpert workbench urls to the ChatKit workbench component', () => {
    const route = children.find((item) => item.matcher && item.component === ChatXpertWorkbenchComponent)
    const entryMatch = route?.matcher?.(
      [new UrlSegment('x', {}), new UrlSegment('sales', {}), new UrlSegment('c', {})],
      new UrlSegmentGroup([], {}),
      {} as Route
    )
    const threadMatch = route?.matcher?.(
      [new UrlSegment('x', {}), new UrlSegment('sales', {}), new UrlSegment('c', {}), new UrlSegment('thread-1', {})],
      new UrlSegmentGroup([], {}),
      {} as Route
    )

    expect(route?.component).toBe(ChatXpertWorkbenchComponent)
    expect(route?.canActivate).toHaveLength(1)
    expect(entryMatch?.posParams?.['name']?.path).toBe('sales')
    expect(entryMatch?.posParams?.['threadId']).toBeUndefined()
    expect(threadMatch?.posParams?.['name']?.path).toBe('sales')
    expect(threadMatch?.posParams?.['threadId']?.path).toBe('thread-1')
  })

  it('removes chat project routes from /chat', () => {
    expect(children.some((item) => item.path === 'p')).toBe(false)
    expect(children.some((item) => item.path === 'p/:id')).toBe(false)
  })

  it('routes /chat/clawxpert to the ClawXpert page', () => {
    const route = children.find((item) => item.path === 'clawxpert')
    const conversationRoute = route?.children?.find((item) => !!item.matcher)
    const matchedRoute = conversationRoute?.matcher?.(
      [new UrlSegment('c', {}), new UrlSegment('thread-1', {})],
      new UrlSegmentGroup([], {}),
      {} as Route
    )

    expect(route?.component).toBe(ClawXpertComponent)
    expect(route?.canActivate).toBeUndefined()
    expect(route?.canActivateChild).toHaveLength(1)
    expect(route?.children?.find((item) => item.path === '')?.component).toBe(ClawXpertOverviewComponent)
    expect(conversationRoute?.component).toBe(ClawXpertConversationDetailComponent)
    expect(matchedRoute?.posParams?.threadId?.path).toBe('thread-1')
  })

  it('redirects legacy /chat/chatbi urls to the top-level ChatBI feature', () => {
    const route = children.find((item) => item.path === 'chatbi')

    expect(route?.redirectTo).toBe('/chatbi')
    expect(route?.pathMatch).toBe('full')
  })

  it('redirects /chat to the default ClawXpert conversation when a valid binding exists', async () => {
    assistantBindingService.get.mockReturnValue(of({ assistantId: 'assistant-1' }))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([{ id: 'assistant-1' }]))

    const route = children.find((item) => item.path === '' && item.canActivate?.length)
    const guard = route?.canActivate?.[0] as () => any
    const result = await runInInjectionContext(injector, () => firstValueFrom(guard()))

    expect(currentUserHydrationService.getFeatureHydration).toHaveBeenCalledWith({ skipSessionCache: true })
    expect(result).toBe('/chat/clawxpert/c')
  })

  it('redirects /chat to the ClawXpert setup page when the binding is missing or orphaned', async () => {
    assistantBindingService.get.mockReturnValue(of({ assistantId: 'assistant-1' }))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([{ id: 'assistant-2' }]))

    const route = children.find((item) => item.path === '' && item.canActivate?.length)
    const guard = route?.canActivate?.[0] as () => any
    const result = await runInInjectionContext(injector, () => firstValueFrom(guard()))

    expect(currentUserHydrationService.getFeatureHydration).toHaveBeenCalledWith({ skipSessionCache: true })
    expect(result).toBe('/chat/clawxpert')
  })

  it('redirects /chat to ClawXpert even when ClawXpert availability must be resolved by the child guard', async () => {
    store.hasFeatureEnabled.mockImplementation((feature: string) => feature === 'FEATURE_XPERT')

    const route = children.find((item) => item.path === '' && item.canActivate?.length)
    const guard = route?.canActivate?.[0] as () => any
    const result = await runInInjectionContext(injector, () => firstValueFrom(guard()))

    expect(result).toBe('/chat/clawxpert')
    expect(assistantBindingService.get).not.toHaveBeenCalled()
  })

  it('guards direct ClawXpert child routes when the feature is unavailable', async () => {
    store.hasFeatureEnabled.mockImplementation((feature: string) => feature === 'FEATURE_XPERT')

    const route = children.find((item) => item.path === 'clawxpert')
    const guard = route?.canActivateChild?.[0] as () => any
    const result = await runInInjectionContext(injector, () => firstValueFrom(guard()))

    expect(currentUserHydrationService.getFeatureHydration).toHaveBeenCalledWith({ skipSessionCache: true })
    expect(result).toBe('/chat/tasks')
  })

  it('guards direct ClawXpert child routes when feature hydration fails', async () => {
    currentUserHydrationService.getFeatureHydration.mockRejectedValue(new Error('hydration failed'))

    const route = children.find((item) => item.path === 'clawxpert')
    const guard = route?.canActivateChild?.[0] as () => any
    const result = await runInInjectionContext(injector, () => firstValueFrom(guard()))

    expect(result).toBe('/chat/tasks')
  })

  it('guards direct ClawXpert child routes when feature hydration stays pending', async () => {
    jest.useFakeTimers()
    currentUserHydrationService.getFeatureHydration.mockReturnValue(new Promise(() => {}))

    const route = children.find((item) => item.path === 'clawxpert')
    const guard = route?.canActivateChild?.[0] as () => any
    const result = runInInjectionContext(injector, () => firstValueFrom(guard()))

    jest.advanceTimersByTime(3000)

    await expect(result).resolves.toBe('/chat/tasks')
  })

  it('redirects /chat to ClawXpert when feature hydration fails', async () => {
    currentUserHydrationService.getFeatureHydration.mockRejectedValue(new Error('hydration failed'))

    const route = children.find((item) => item.path === '' && item.canActivate?.length)
    const guard = route?.canActivate?.[0] as () => any
    const result = await runInInjectionContext(injector, () => firstValueFrom(guard()))

    expect(result).toBe('/chat/clawxpert')
    expect(store.hasFeatureEnabled).not.toHaveBeenCalled()
    expect(assistantBindingService.get).not.toHaveBeenCalled()
  })

  it('redirects /chat to ClawXpert when feature hydration stays pending', async () => {
    jest.useFakeTimers()
    currentUserHydrationService.getFeatureHydration.mockReturnValue(new Promise(() => {}))

    const route = children.find((item) => item.path === '' && item.canActivate?.length)
    const guard = route?.canActivate?.[0] as () => any
    const result = runInInjectionContext(injector, () => firstValueFrom(guard()))

    jest.advanceTimersByTime(3000)

    await expect(result).resolves.toBe('/chat/clawxpert')
    expect(store.hasFeatureEnabled).not.toHaveBeenCalled()
    expect(assistantBindingService.get).not.toHaveBeenCalled()
  })

  it('redirects unknown chat routes to ClawXpert', () => {
    const route = children.find((item) => item.path === '**')

    expect(route?.redirectTo).toBe('clawxpert')
  })
})
