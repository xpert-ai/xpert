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

jest.mock('./chatbi/chatbi.component', () => ({
  ChatBiComponent: class ChatBiComponent {}
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

jest.mock('./welcome/welcome.component', () => ({
  ChatCommonWelcomeComponent: class ChatCommonWelcomeComponent {}
}))

import { ChatCommonAssistantComponent } from './common/common.component'
import { Injector, runInInjectionContext } from '@angular/core'
import { Route, Router, UrlSegment, UrlSegmentGroup } from '@angular/router'
import { Observable, firstValueFrom, of } from 'rxjs'
import { routes } from './routes'
import { ChatXpertComponent } from './xpert/xpert.component'
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

    injector = Injector.create({
      providers: [
        { provide: Store, useValue: store },
        { provide: AssistantBindingService, useValue: assistantBindingService },
        { provide: Router, useValue: router }
      ]
    })
  })

  it('routes /chat/x/common to the common assistant component', () => {
    const route = children.find((item) => item.path === 'x/common')

    expect(route?.component).toBe(ChatCommonAssistantComponent)
  })

  it('redirects legacy common conversation urls back to /chat/x/common', () => {
    const route = children.find((item) => item.path === 'x/common/c/:id')

    expect(route?.redirectTo).toBe('/chat/x/common')
  })

  it('keeps /chat/c/:id on the legacy chat xpert component', () => {
    const route = children.find((item) => item.path === 'c/:id')

    expect(route?.component).toBe(ChatXpertComponent)
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
    expect(route?.children?.find((item) => item.path === '')?.component).toBe(ClawXpertOverviewComponent)
    expect(conversationRoute?.component).toBe(ClawXpertConversationDetailComponent)
    expect(matchedRoute?.posParams?.threadId?.path).toBe('thread-1')
  })

  it('redirects /chat to the default ClawXpert conversation when a valid binding exists', async () => {
    assistantBindingService.get.mockReturnValue(of({ assistantId: 'assistant-1' }))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([{ id: 'assistant-1' }]))

    const route = children.find((item) => item.path === '' && item.canActivate?.length)
    const guard = route?.canActivate?.[0] as () => any
    const result = await runInInjectionContext(injector, () => firstValueFrom(guard()))

    expect(result).toBe('/chat/clawxpert/c')
  })

  it('redirects /chat to the ClawXpert setup page when the binding is missing or orphaned', async () => {
    assistantBindingService.get.mockReturnValue(of({ assistantId: 'assistant-1' }))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([{ id: 'assistant-2' }]))

    const route = children.find((item) => item.path === '' && item.canActivate?.length)
    const guard = route?.canActivate?.[0] as () => any
    const result = await runInInjectionContext(injector, () => firstValueFrom(guard()))

    expect(result).toBe('/chat/clawxpert')
  })

  it('redirects /chat to the welcome assistant when ClawXpert is unavailable', async () => {
    store.hasFeatureEnabled.mockImplementation((feature: string) => feature === 'FEATURE_XPERT')

    const route = children.find((item) => item.path === '' && item.canActivate?.length)
    const guard = route?.canActivate?.[0] as () => any
    const result = await runInInjectionContext(injector, () => firstValueFrom(guard()))

    expect(result).toBe('/chat/x/welcome')
    expect(assistantBindingService.get).not.toHaveBeenCalled()
  })
})
