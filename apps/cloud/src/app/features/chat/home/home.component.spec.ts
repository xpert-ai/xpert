import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { provideRouter, Router } from '@angular/router'
import { trigger } from '@angular/animations'
import { of } from 'rxjs'
import { AiFeatureEnum, Store } from '../../../@core'
import { XpertHomeService } from '../../../xpert'
import { ClawXpertFacade } from '../clawxpert/clawxpert.facade'
import { ChatHomeService } from '../home.service'
import { ChatHomeComponent } from './home.component'

jest.mock('@xpert-ai/core', () => ({
  routeAnimations: trigger('routeAnimations', [])
}))

jest.mock('../../../@core', () => {
  class Store {}

  return {
    AiFeatureEnum: {
      FEATURE_XPERT: 'FEATURE_XPERT',
      FEATURE_XPERT_CLAWXPERT: 'FEATURE_XPERT_CLAWXPERT'
    },
    Store
  }
})

jest.mock('../../../xpert', () => ({
  XpertHomeService: class XpertHomeService {}
}))

jest.mock('../home.service', () => ({
  ChatHomeService: class ChatHomeService {}
}))

jest.mock('../clawxpert/clawxpert.facade', () => ({
  ClawXpertFacade: class ClawXpertFacade {}
}))

@Component({
  standalone: true,
  template: ''
})
class DummyComponent {}

describe('ChatHomeComponent', () => {
  let homeService: {
    conversationId: ReturnType<typeof signal<string | null>>
    conversation: ReturnType<typeof signal<unknown>>
  }
  let store: {
    featureContextHydrated$: ReturnType<typeof of<boolean>>
    featureContextHydrated: boolean
    featureContextHydrationLoading$: ReturnType<typeof of<boolean>>
    featureContextHydrationLoading: boolean
    hasFeatureEnabled: jest.Mock
  }

  beforeEach(async () => {
    homeService = {
      conversationId: signal(null),
      conversation: signal(null)
    }
    store = {
      featureContextHydrated$: of(true),
      featureContextHydrated: true,
      featureContextHydrationLoading$: of(false),
      featureContextHydrationLoading: false,
      hasFeatureEnabled: jest.fn((feature: string) =>
        [AiFeatureEnum.FEATURE_XPERT, AiFeatureEnum.FEATURE_XPERT_CLAWXPERT].includes(feature as AiFeatureEnum)
      )
    }

    TestBed.resetTestingModule()
    TestBed.overrideComponent(ChatHomeComponent, {
      set: {
        providers: [
          {
            provide: ChatHomeService,
            useValue: homeService
          },
          {
            provide: XpertHomeService,
            useValue: homeService
          },
          {
            provide: ClawXpertFacade,
            useValue: {}
          }
        ]
      }
    })

    await TestBed.configureTestingModule({
      imports: [ChatHomeComponent],
      providers: [
        provideRouter([
          { path: 'chat/x/common', component: DummyComponent },
          { path: 'chat/clawxpert/c', component: DummyComponent },
          { path: '**', component: DummyComponent }
        ]),
        provideNoopAnimations(),
        {
          provide: Store,
          useValue: store
        }
      ]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.restoreAllMocks()
  })

  it('renders only the child chat route outlet and no inner assistants sidebar', () => {
    const fixture = TestBed.createComponent(ChatHomeComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('pac-chat-sidebar-xperts')).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-chat-sidebar-xperts]')).toBeNull()
  })

  it('clears the common conversation state on the common chat route', async () => {
    homeService.conversationId.set('conversation-1')
    homeService.conversation.set({ id: 'conversation-1' })

    const fixture = TestBed.createComponent(ChatHomeComponent)
    const router = TestBed.inject(Router)

    fixture.detectChanges()
    await router.navigateByUrl('/chat/x/common')
    await fixture.whenStable()
    fixture.detectChanges()

    expect(homeService.conversationId()).toBeNull()
    expect(homeService.conversation()).toBeNull()
  })

  it('redirects away from ClawXpert when the feature is disabled after hydration', async () => {
    store.hasFeatureEnabled.mockImplementation((feature: string) => feature === AiFeatureEnum.FEATURE_XPERT)

    const router = TestBed.inject(Router)
    Object.defineProperty(router, 'url', {
      configurable: true,
      get: () => '/chat/clawxpert/c'
    })
    const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true)

    const fixture = TestBed.createComponent(ChatHomeComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    expect(navigateSpy).toHaveBeenCalledWith('/chat/x/common')
  })

  it('does not redirect away from ClawXpert while feature hydration is loading', async () => {
    store.featureContextHydrationLoading$ = of(true)
    store.featureContextHydrationLoading = true
    store.hasFeatureEnabled.mockImplementation((feature: string) => feature === AiFeatureEnum.FEATURE_XPERT)

    const router = TestBed.inject(Router)
    Object.defineProperty(router, 'url', {
      configurable: true,
      get: () => '/chat/clawxpert/c'
    })
    const navigateSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true)

    const fixture = TestBed.createComponent(ChatHomeComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    expect(navigateSpy).not.toHaveBeenCalled()
  })
})
