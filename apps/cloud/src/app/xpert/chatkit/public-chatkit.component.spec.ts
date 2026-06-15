import { Location } from '@angular/common'
import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type { ChatKitControl } from '@xpert-ai/chatkit-angular'
import { BehaviorSubject, of } from 'rxjs'
import { AppService } from '../../app.service'
import { Store, ToastrService, XpertAPIService } from '../../@core'
import { PublicChatkitComponent } from './public-chatkit.component'

type RuntimeInput = Parameters<
  typeof import('../../features/assistant/assistant-chatkit.runtime').injectHostedAssistantChatkitControl
>[0]

let mockRuntimeInput: RuntimeInput | null = null

jest.mock('../../app.service', () => ({
  AppService: class AppService {}
}))

jest.mock('../../@core', () => ({
  Store: class Store {},
  ToastrService: class ToastrService {},
  XpertAPIService: class XpertAPIService {}
}))

jest.mock('@xpert-ai/chatkit-angular', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'xpert-chatkit',
    template: ''
  })
  class ChatKit {
    @Input() control?: unknown
  }

  return {
    ChatKit
  }
})

jest.mock('../../features/assistant/assistant-chatkit.runtime', () => {
  const { signal } = jest.requireActual('@angular/core')

  return {
    injectHostedAssistantChatkitControl: (input: RuntimeInput) => {
      mockRuntimeInput = input
      return signal({} as ChatKitControl)
    },
    sanitizeAssistantFrameUrl: (frameUrl?: string | null) => frameUrl?.trim() || null
  }
})

const publicXpert = {
  id: 'xpert-1',
  slug: 'sales',
  name: 'Sales Agent',
  title: 'Sales Assistant',
  description: 'Answers sales questions.',
  organizationId: 'org-xpert',
  app: {
    enabled: true,
    public: true
  },
  features: {
    opener: {
      enabled: true,
      message: 'How can I help sales today?',
      questions: ['Create a quote']
    }
  }
}

describe('PublicChatkitComponent', () => {
  let fixture: ComponentFixture<PublicChatkitComponent>
  let routeData$: BehaviorSubject<Record<string, unknown>>
  let routeParamMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>
  let xpertService: { createPublicChatkitSession: jest.Mock }
  let location: { replaceState: jest.Mock; path: jest.Mock }
  let store: {
    token: string
    token$: BehaviorSubject<string>
    organizationId: string
    selectOrganizationId: jest.Mock
  }

  beforeEach(() => {
    mockRuntimeInput = null
    routeData$ = new BehaviorSubject<Record<string, unknown>>({ xpert: publicXpert })
    routeParamMap$ = new BehaviorSubject(convertToParamMap({ name: 'sales', id: 'thread-1' }))
    xpertService = {
      createPublicChatkitSession: jest.fn(() =>
        of({
          client_secret: 'client-secret-1',
          expires_at: '2026-06-15T00:00:00.000Z',
          expires_after: 600,
          xpertId: 'xpert-1',
          assistantId: 'xpert-1',
          organizationId: 'org-xpert'
        })
      )
    }
    location = {
      replaceState: jest.fn(),
      path: jest.fn(() => '/chatkit/x/sales/c/thread-1')
    }
    store = {
      token: 'user-token-1',
      token$: new BehaviorSubject('user-token-1'),
      organizationId: 'org-store',
      selectOrganizationId: jest.fn(() => of('org-store'))
    }

    TestBed.configureTestingModule({
      imports: [PublicChatkitComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            data: routeData$.asObservable(),
            paramMap: routeParamMap$.asObservable(),
            snapshot: {
              data: routeData$.value,
              paramMap: routeParamMap$.value
            }
          }
        },
        {
          provide: XpertAPIService,
          useValue: xpertService
        },
        {
          provide: Location,
          useValue: location
        },
        {
          provide: Store,
          useValue: store
        },
        {
          provide: AppService,
          useValue: {
            lang: signal('en'),
            theme$: signal({ primary: 'light' })
          }
        },
        {
          provide: ToastrService,
          useValue: {
            error: jest.fn()
          }
        },
        {
          provide: TranslateService,
          useValue: {
            currentLang: 'en',
            instant: (_key: string, params?: { Default?: string }) => params?.Default ?? _key
          }
        }
      ]
    })

    fixture = TestBed.createComponent(PublicChatkitComponent)
    fixture.detectChanges()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('passes the routed public xpert and thread into the ChatKit runtime', () => {
    expect(mockRuntimeInput?.assistantId()).toBe('xpert-1')
    expect(mockRuntimeInput?.initialThread?.()).toBe('thread-1')
    expect(mockRuntimeInput?.title?.()).toBe('Sales Assistant')
    expect(mockRuntimeInput?.startScreen?.()).toEqual({
      greeting: 'How can I help sales today?',
      prompts: [{ label: 'Create a quote', prompt: 'Create a quote' }]
    })
  })

  it('fills the root flex outlet width for the public ChatKit shell', () => {
    const host = fixture.nativeElement as HTMLElement
    const chatkit = host.querySelector('xpert-chatkit') as HTMLElement | null

    expect(host.classList.contains('flex-1')).toBe(true)
    expect(host.classList.contains('min-w-0')).toBe(true)
    expect(chatkit?.classList.contains('h-full')).toBe(true)
  })

  it('requests a public ChatKit client secret for anonymous public apps', async () => {
    const secret = await mockRuntimeInput?.getClientSecret?.('current-secret')

    expect(xpertService.createPublicChatkitSession).toHaveBeenCalledWith('sales', 'current-secret')
    expect(secret).toEqual({
      secret: 'client-secret-1',
      organizationId: 'org-xpert',
      xpertId: 'xpert-1',
      assistantId: 'xpert-1'
    })
  })

  it('uses the authenticated user token for non-public account apps', async () => {
    routeData$.next({
      xpert: {
        ...publicXpert,
        app: {
          enabled: true,
          public: false
        }
      }
    })
    fixture.detectChanges()

    const secret = await mockRuntimeInput?.getClientSecret?.(null)

    expect(xpertService.createPublicChatkitSession).not.toHaveBeenCalled()
    expect(secret).toEqual({
      secret: 'user-token-1',
      organizationId: 'org-store',
      xpertId: 'xpert-1',
      assistantId: 'xpert-1'
    })
  })

  it('waits for the authenticated user token before opening non-public account apps', () => {
    store.token = ''
    store.token$.next('')
    routeData$.next({
      xpert: {
        ...publicXpert,
        app: {
          enabled: true,
          public: false
        }
      }
    })
    fixture.detectChanges()

    expect(mockRuntimeInput?.identity()).toBeNull()

    store.token = 'user-token-2'
    store.token$.next('user-token-2')
    fixture.detectChanges()

    expect(mockRuntimeInput?.identity()).toBe('public-chatkit:xpert-1:account')
  })

  it('syncs ChatKit thread changes back to the canonical public URL', () => {
    mockRuntimeInput?.onThreadChange?.({ threadId: 'thread-2' })
    mockRuntimeInput?.onThreadChange?.({ threadId: null })

    expect(location.replaceState).toHaveBeenNthCalledWith(1, '/chatkit/x/sales/c/thread-2')
    expect(location.replaceState).toHaveBeenNthCalledWith(2, '/chatkit/x/sales')
  })
})
