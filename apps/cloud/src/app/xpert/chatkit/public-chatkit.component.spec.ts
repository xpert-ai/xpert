import { Location } from '@angular/common'
import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type { ChatKitControl } from '@xpert-ai/chatkit-angular'
import { BehaviorSubject, of, Subject, throwError } from 'rxjs'
import { AppService } from '../../app.service'
import { Store, ToastrService, XpertAPIService } from '../../@core'
import { PublicChatkitComponent } from './public-chatkit.component'
import { DingTalkH5Service } from './dingtalk-h5.service'
import { ENTERPRISE_H5_CLIENT_ADAPTERS } from './enterprise-h5-adapter'

type RuntimeInput = Parameters<
  typeof import('../../features/assistant/assistant-chatkit.runtime').injectHostedAssistantChatkitControl
>[0]

let mockRuntimeInput: RuntimeInput | null = null

async function flushUntrackedAsyncWork(fixture: ComponentFixture<PublicChatkitComponent>) {
  for (let attempt = 0; attempt < 10; attempt++) {
    await Promise.resolve()
  }
  fixture.detectChanges()
}

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
  const { computed } = jest.requireActual('@angular/core')

  return {
    injectHostedAssistantChatkitControl: (input: RuntimeInput) => {
      mockRuntimeInput = input
      return computed(() => (input.identity() ? ({} as ChatKitControl) : null))
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
  let xpertService: {
    createPublicChatkitSession: jest.Mock
    getEnterpriseH5Bootstrap: jest.Mock
    createEnterpriseH5Session: jest.Mock
    getSsoProviders: jest.Mock
  }
  let dingtalkService: { requestAuthorizationCode: jest.Mock }
  let translateService: {
    currentLang: string
    instant: jest.Mock
    get: jest.Mock
    onTranslationChange: Subject<unknown>
    onLangChange: Subject<unknown>
    onFallbackLangChange: Subject<unknown>
    getCurrentLang: jest.Mock
    getFallbackLang: jest.Mock
  }
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
      ),
      getEnterpriseH5Bootstrap: jest.fn(() =>
        of({
          xpert: {
            ...publicXpert,
            app: {
              enabled: true,
              public: false,
              channels: {
                dingtalk: {
                  enabled: true,
                  integrationId: 'integration-1'
                }
              }
            }
          },
          platform: 'dingtalk',
          clientConfig: {
            clientId: 'client-id-1',
            corpId: 'corp-1'
          }
        })
      ),
      createEnterpriseH5Session: jest.fn(() =>
        of({
          client_secret: 'client-secret-dingtalk',
          expires_at: '2026-06-15T00:00:00.000Z',
          expires_after: 600,
          xpertId: 'xpert-1',
          assistantId: 'xpert-1',
          organizationId: 'org-xpert'
        })
      ),
      getSsoProviders: jest.fn(() =>
        of({
          fallbackApplied: false,
          providers: [
            {
              provider: 'dingtalk-sso',
              displayName: 'DingTalk',
              icon: '/assets/dingtalk.svg',
              order: 105,
              startUrl: '/api/dingtalk-identity/login/start'
            }
          ]
        })
      )
    }
    dingtalkService = {
      requestAuthorizationCode: jest.fn().mockResolvedValue('auth-code-1')
    }
    translateService = {
      currentLang: 'en',
      instant: jest.fn((_key: string, params?: { Default?: string }) => params?.Default ?? _key),
      get: jest.fn((key: string, params?: { Default?: string }) => of(params?.Default ?? key)),
      onTranslationChange: new Subject(),
      onLangChange: new Subject(),
      onFallbackLangChange: new Subject(),
      getCurrentLang: jest.fn(() => 'en'),
      getFallbackLang: jest.fn(() => 'en')
    }
    location = {
      replaceState: jest.fn(),
      path: jest.fn(() => '/x-chatkit/x/sales/c/thread-1')
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
          provide: DingTalkH5Service,
          useValue: dingtalkService
        },
        {
          provide: ENTERPRISE_H5_CLIENT_ADAPTERS,
          useFactory: () => [
            {
              platform: 'dingtalk',
              requestIdentityGrant: async (clientConfig: Record<string, unknown>) => ({
                type: 'authorization_code',
                code: await dingtalkService.requestAuthorizationCode(
                  String(clientConfig['clientId'] ?? ''),
                  String(clientConfig['corpId'] ?? '')
                )
              })
            }
          ]
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
          useValue: translateService
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
    expect(mockRuntimeInput?.layout).toEqual({
      maxWidth: '960px'
    })
    expect(mockRuntimeInput?.workbench).toEqual({
      enabled: true
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

    expect(location.replaceState).toHaveBeenNthCalledWith(1, '/x-chatkit/x/sales/c/thread-2')
    expect(location.replaceState).toHaveBeenNthCalledWith(2, '/x-chatkit/x/sales')
  })

  it('loads DingTalk bootstrap data and exchanges a one-time code for a scoped client secret', async () => {
    routeData$.next({ channel: 'enterprise-h5' })
    routeParamMap$.next(convertToParamMap({ name: 'sales', platform: 'dingtalk' }))
    fixture.detectChanges()
    await flushUntrackedAsyncWork(fixture)

    expect(xpertService.getEnterpriseH5Bootstrap).toHaveBeenCalledWith('sales', 'dingtalk')
    expect(mockRuntimeInput?.identity()).toBe('enterprise-h5:dingtalk:xpert-1')

    const secret = await mockRuntimeInput?.getClientSecret?.(null)

    expect(dingtalkService.requestAuthorizationCode).toHaveBeenCalledWith('client-id-1', 'corp-1')
    expect(dingtalkService.requestAuthorizationCode).toHaveBeenCalledTimes(1)
    expect(xpertService.createEnterpriseH5Session).toHaveBeenCalledWith('sales', 'dingtalk', {
      type: 'authorization_code',
      code: 'auth-code-1'
    })
    expect(xpertService.createEnterpriseH5Session).toHaveBeenCalledTimes(1)
    expect(secret).toEqual({
      secret: 'client-secret-dingtalk',
      organizationId: 'org-xpert',
      xpertId: 'xpert-1',
      assistantId: 'xpert-1'
    })

    mockRuntimeInput?.onThreadChange?.({ threadId: 'thread-dingtalk' })
    expect(location.replaceState).toHaveBeenLastCalledWith('/x-chatkit/h5/dingtalk/sales/c/thread-dingtalk')
  })

  it('does not mount ChatKit before the enterprise identity session is established', async () => {
    const session$ = new Subject<{
      client_secret: string
      expires_at: string
      expires_after: number
      xpertId: string
      assistantId: string
      organizationId: string
    }>()
    xpertService.createEnterpriseH5Session.mockReturnValue(session$)

    routeData$.next({ channel: 'enterprise-h5' })
    routeParamMap$.next(convertToParamMap({ name: 'sales', platform: 'dingtalk' }))
    fixture.detectChanges()
    await flushUntrackedAsyncWork(fixture)

    expect(xpertService.createEnterpriseH5Session).toHaveBeenCalled()
    expect(mockRuntimeInput?.identity()).toBeNull()
    expect(fixture.nativeElement.querySelector('xpert-chatkit')).toBeNull()
    expect(fixture.nativeElement.textContent).toContain('Preparing assistant...')

    session$.next({
      client_secret: 'client-secret-dingtalk',
      expires_at: '2026-06-15T00:00:00.000Z',
      expires_after: 600,
      xpertId: 'xpert-1',
      assistantId: 'xpert-1',
      organizationId: 'org-xpert'
    })
    session$.complete()
    await flushUntrackedAsyncWork(fixture)

    expect(mockRuntimeInput?.identity()).toBe('enterprise-h5:dingtalk:xpert-1')
    expect(fixture.nativeElement.querySelector('xpert-chatkit')).not.toBeNull()
  })

  it('translates the DingTalk bootstrap failure shown to the employee', async () => {
    xpertService.getEnterpriseH5Bootstrap.mockReturnValue(throwError(() => new Error('unavailable')))
    translateService.instant.mockReturnValue('Translated DingTalk unavailable')

    routeData$.next({ channel: 'enterprise-h5' })
    routeParamMap$.next(convertToParamMap({ name: 'sales', platform: 'dingtalk' }))
    fixture.detectChanges()
    await flushUntrackedAsyncWork(fixture)

    expect(translateService.instant).toHaveBeenCalledWith('XP.Xpert.EnterpriseH5AppUnavailable', {
      Default: 'This enterprise digital expert is unavailable or not configured.'
    })
    expect(fixture.componentInstance.error()).toBe('Translated DingTalk unavailable')
  })

  it('shows an identity error instead of mounting ChatKit when the enterprise session fails', async () => {
    xpertService.createEnterpriseH5Session.mockReturnValue(throwError(() => new Error('identity unavailable')))
    translateService.instant.mockReturnValue('Translated identity unavailable')

    routeData$.next({ channel: 'enterprise-h5' })
    routeParamMap$.next(convertToParamMap({ name: 'sales', platform: 'dingtalk' }))
    fixture.detectChanges()
    await flushUntrackedAsyncWork(fixture)

    expect(translateService.instant).toHaveBeenCalledWith('XP.Xpert.EnterpriseH5SessionUnavailable', {
      Default: 'Unable to verify your enterprise identity for this digital expert.'
    })
    expect(mockRuntimeInput?.identity()).toBeNull()
    expect(fixture.nativeElement.querySelector('xpert-chatkit')).toBeNull()
    expect(fixture.componentInstance.error()).toBe('Translated identity unavailable')
  })

  it('retries the same enterprise H5 bootstrap without a full page refresh', async () => {
    xpertService.getEnterpriseH5Bootstrap.mockReturnValueOnce(throwError(() => new Error('temporary failure')))

    routeData$.next({ channel: 'enterprise-h5' })
    routeParamMap$.next(convertToParamMap({ name: 'sales', platform: 'dingtalk' }))
    fixture.detectChanges()
    await flushUntrackedAsyncWork(fixture)

    xpertService.getEnterpriseH5Bootstrap.mockReturnValue(
      of({
        xpert: publicXpert,
        platform: 'dingtalk',
        clientConfig: { clientId: 'client-id-1', corpId: 'corp-1' }
      })
    )
    await fixture.componentInstance.retryEnterpriseH5Bootstrap()

    expect(xpertService.getEnterpriseH5Bootstrap).toHaveBeenCalledTimes(2)
    expect(fixture.componentInstance.error()).toBeNull()
    expect(mockRuntimeInput?.identity()).toBe('enterprise-h5:dingtalk:xpert-1')
  })

  it('starts the matching SSO binding flow when the enterprise identity is not bound', async () => {
    xpertService.createEnterpriseH5Session.mockReturnValue(
      of({
        status: 'account_binding_required',
        accountBindingProvider: 'dingtalk-sso'
      })
    )
    location.path.mockReturnValue('/x-chatkit/h5/dingtalk/sales')
    const redirect = jest
      .spyOn(
        fixture.componentInstance as unknown as { redirectToLocation(location: string): void },
        'redirectToLocation'
      )
      .mockImplementation(() => undefined)

    routeData$.next({ channel: 'enterprise-h5' })
    routeParamMap$.next(convertToParamMap({ name: 'sales', platform: 'dingtalk' }))
    fixture.detectChanges()
    await flushUntrackedAsyncWork(fixture)

    expect(xpertService.getSsoProviders).toHaveBeenCalled()
    expect(mockRuntimeInput?.identity()).toBeNull()
    expect(redirect).toHaveBeenCalledWith(
      expect.stringContaining('/api/dingtalk-identity/login/start?returnTo=%2Fx-chatkit%2Fh5%2Fdingtalk%2Fsales')
    )
  })

  it('retries SSO provider discovery when plugin registration is briefly unavailable', async () => {
    xpertService.createEnterpriseH5Session.mockReturnValue(
      of({
        status: 'account_binding_required',
        accountBindingProvider: 'dingtalk-sso'
      })
    )
    xpertService.getSsoProviders.mockReturnValueOnce(of({ fallbackApplied: false, providers: [] })).mockReturnValueOnce(
      of({
        fallbackApplied: false,
        providers: [
          {
            provider: 'dingtalk-sso',
            displayName: 'DingTalk',
            icon: '/assets/dingtalk.svg',
            order: 105,
            startUrl: '/api/dingtalk-identity/login/start'
          }
        ]
      })
    )
    const redirect = jest
      .spyOn(
        fixture.componentInstance as unknown as { redirectToLocation(location: string): void },
        'redirectToLocation'
      )
      .mockImplementation(() => undefined)

    routeData$.next({ channel: 'enterprise-h5' })
    routeParamMap$.next(convertToParamMap({ name: 'sales', platform: 'dingtalk' }))
    fixture.detectChanges()
    await flushUntrackedAsyncWork(fixture)

    expect(xpertService.getSsoProviders).toHaveBeenCalledTimes(2)
    expect(mockRuntimeInput?.identity()).toBeNull()
    expect(redirect).toHaveBeenCalled()
  })
})
