import { Component, signal, type WritableSignal } from '@angular/core'
import { discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, Observable, of, Subject } from 'rxjs'
import {
  AiFeatureEnum,
  AssistantBindingService,
  ChatConversationService,
  OrderTypeEnum,
  ScopeService,
  Store,
  ViewExtensionApiService,
  XpertAPIService
} from '../../@core'
import { CloudSidebarAssistantsComponent, formatConversationUpdatedAt } from './cloud-sidebar-assistants.component'
import {
  type AssistantXpertLike,
  filterAssistantXperts,
  getAssistantBusinessArea,
  getAssistantBusinessAreaInitial,
  getAssistantDescription,
  getAssistantLabel,
  getAssistantName,
  getAssistantRouteId,
  isAssistantRouteActive,
  normalizeAssistantXperts,
  orderAssistantXperts
} from './cloud-sidebar-assistants.utils'

jest.mock('../../@shared/xpert/assistant-profile/assistant-profile.directive', () => {
  const { Directive, Input } = jest.requireActual('@angular/core')

  @Directive({ standalone: true, selector: '[xpAssistantProfile]', exportAs: 'xpAssistantProfile' })
  class AssistantProfileDirective {
    @Input('xpAssistantProfile') instanceId?: string
    @Input() summary?: unknown
    @Input() zPlacement?: string
    open = jest.fn()
  }

  return { AssistantProfileDirective }
})

jest.mock('@xpert-ai/headless-ui', () => {
  const { Component, Directive, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'z-icon',
    template: ''
  })
  class ZardIconComponent {
    @Input() zType?: string
  }

  @Directive({
    standalone: true,
    // eslint-disable-next-line @angular-eslint/directive-selector
    selector: '[zTooltip]'
  })
  class ZTooltipDirective {
    @Input() zTooltip?: string
    @Input() zPosition?: string
    @Input() zDisabled?: boolean
  }

  return {
    ZardIconComponent,
    ZardTooltipImports: [ZTooltipDirective]
  }
})

jest.mock('../../@core', () => {
  class AssistantBindingService {}
  class ChatConversationService {}
  class Store {}
  class XpertAPIService {}
  class ViewExtensionApiService {}

  return {
    AiFeatureEnum: {
      FEATURE_XPERT: 'FEATURE_XPERT',
      FEATURE_XPERT_CLAWXPERT: 'FEATURE_XPERT_CLAWXPERT'
    },
    AIPermissionsEnum: {
      XPERT_EDIT: 'XPERT_EDIT'
    },
    AssistantBindingScope: {
      TENANT: 'tenant',
      ORGANIZATION: 'organization',
      USER: 'user'
    },
    AssistantCode: {
      CHAT_COMMON: 'chat_common',
      XPERT_SHARED: 'xpert_shared',
      CLAWXPERT: 'clawxpert'
    },
    RequestScopeLevel: {
      TENANT: 'tenant',
      ORGANIZATION: 'organization'
    },
    OrderTypeEnum: {
      DESC: 'DESC'
    },
    AssistantBindingService,
    ChatConversationService,
    ScopeService: class ScopeService {},
    Store,
    XpertAPIService,
    ViewExtensionApiService
  }
})

jest.mock('../../@shared/avatar/emoji-avatar/avatar.component', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    // eslint-disable-next-line @angular-eslint/component-selector
    selector: 'emoji-avatar',
    template: '<span data-testid="emoji-avatar"></span>'
  })
  class EmojiAvatarComponent {
    @Input() avatar?: unknown
    @Input() alt?: string
    @Input() fallbackLabel?: string
  }

  return {
    EmojiAvatarComponent
  }
})

@Component({
  standalone: true,
  template: ''
})
class DummyComponent {}

const ASSISTANT_ORDER_STORAGE_KEY = 'xpert.cloud-sidebar.assistant-order:user-1:organization:org-1'

describe('CloudSidebarAssistantsComponent', () => {
  let documentVisibilityState: DocumentVisibilityState
  let assistantBindingService: {
    changes$: ReturnType<Subject<{ code: string; scope: string }>['asObservable']>
    get: jest.Mock
    getAvailableXperts: jest.Mock
  }
  let assistantBindingChanges$: Subject<{ code: string; scope: string }>
  let xpertRefresh$: BehaviorSubject<void>
  let xpertAPI: {
    onRefresh: jest.Mock
  }
  let conversationService: {
    getUnreadByXperts: jest.Mock
    getSidebarConversations: jest.Mock
    unreadRefresh$: Subject<void>
    sidebarRefresh$: Subject<{ xpertId: string }>
  }
  let viewExtensionApi: {
    getSlotViews: jest.Mock
  }
  let store: {
    user: { id: string }
    userId: string
    organizationId: string | null
    selectOrganizationId: jest.Mock
    selectedWorkspace$: Observable<{ id: string } | null>
    featureContextHydrated$: ReturnType<typeof of<boolean>>
    featureContextHydrated: boolean
    hasFeatureEnabled: jest.Mock
    hasPermission: jest.Mock
  }
  let scopeService: {
    activeScope: WritableSignal<{ level: string; organizationId?: string | null }>
  }

  beforeEach(async () => {
    localStorage.removeItem(ASSISTANT_ORDER_STORAGE_KEY)
    documentVisibilityState = 'visible'
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => documentVisibilityState
    })
    assistantBindingChanges$ = new Subject<{ code: string; scope: string }>()
    xpertRefresh$ = new BehaviorSubject<void>(undefined)
    xpertAPI = {
      onRefresh: jest.fn(() => xpertRefresh$.asObservable())
    }
    assistantBindingService = {
      changes$: assistantBindingChanges$.asObservable(),
      get: jest.fn(() => of({ assistantId: 'bound-xpert' })),
      getAvailableXperts: jest.fn(() =>
        of([
          {
            id: 'other-xpert',
            slug: 'other-assistant',
            title: 'Other Assistant',
            description: 'General workbench assistant',
            latest: true,
            workspaceId: 'workspace-1',
            workspace: {
              capabilities: {
                canRead: true,
                canRun: true,
                canWrite: true,
                canManage: false
              }
            }
          },
          {
            id: 'bound-xpert',
            slug: 'personal-assistant',
            title: 'Personal Assistant',
            description: 'Bound ClawXpert assistant',
            latest: true,
            workspaceId: 'workspace-1',
            workspace: {
              capabilities: {
                canRead: true,
                canRun: true,
                canWrite: true,
                canManage: false
              }
            }
          }
        ])
      )
    }
    conversationService = {
      getUnreadByXperts: jest.fn(() => of([])),
      getSidebarConversations: jest.fn(() => of({ items: [], total: 0 })),
      unreadRefresh$: new Subject<void>(),
      sidebarRefresh$: new Subject<{ xpertId: string }>()
    }
    viewExtensionApi = {
      getSlotViews: jest.fn(() =>
        of([
          {
            key: 'sales-orders',
            title: { en_US: 'Open sales orders', zh_Hans: '未清销售订单' },
            icon: { type: 'emoji', value: '📦' },
            hostType: 'agent',
            slot: 'agent.workbench.fixed',
            source: { type: 'builtin' },
            view: {},
            dataSource: {},
            workbench: {
              fixed: true,
              menu: {
                enabled: true,
                label: { en_US: 'Open sales orders', zh_Hans: '未清销售订单' },
                order: 10
              }
            }
          }
        ])
      )
    }
    store = {
      user: { id: 'user-1' },
      userId: 'user-1',
      organizationId: 'org-1',
      selectOrganizationId: jest.fn(() => of('org-1')),
      selectedWorkspace$: of({ id: 'workspace-1' }),
      featureContextHydrated$: of(true),
      featureContextHydrated: true,
      hasFeatureEnabled: jest.fn((feature: string) =>
        [AiFeatureEnum.FEATURE_XPERT, AiFeatureEnum.FEATURE_XPERT_CLAWXPERT].includes(feature as AiFeatureEnum)
      ),
      hasPermission: jest.fn((permission: string) => permission === 'XPERT_EDIT')
    }
    scopeService = {
      activeScope: signal({ level: 'organization', organizationId: 'org-1' })
    }

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), CloudSidebarAssistantsComponent],
      providers: [
        provideRouter([{ path: '**', component: DummyComponent }]),
        {
          provide: AssistantBindingService,
          useValue: assistantBindingService
        },
        {
          provide: ChatConversationService,
          useValue: conversationService
        },
        {
          provide: ScopeService,
          useValue: scopeService
        },
        {
          provide: Store,
          useValue: store
        },
        {
          provide: XpertAPIService,
          useValue: xpertAPI
        },
        {
          provide: ViewExtensionApiService,
          useValue: viewExtensionApi
        }
      ]
    }).compileComponents()
  })

  afterEach(() => {
    localStorage.removeItem(ASSISTANT_ORDER_STORAGE_KEY)
    jest.useRealTimers()
    TestBed.resetTestingModule()
    jest.restoreAllMocks()
  })

  it('keeps normal assistant rows on the assistant chat route', async () => {
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)
    const router = TestBed.inject(Router)
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const normalAssistantButton = fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__item')[0]
    normalAssistantButton.click()

    expect(navigateSpy).toHaveBeenCalledWith(['/chat/x', 'other-assistant', 'c'])
  })

  it('opens the latest unread history thread when an assistant has unread messages', async () => {
    conversationService.getUnreadByXperts.mockReturnValue(
      of([
        {
          xpertId: 'other-xpert',
          unreadMessages: 1,
          unreadConversations: 1,
          latestUnreadAt: '2026-06-21T00:00:00.000Z',
          latestUnreadConversationId: 'conversation-unread',
          latestUnreadThreadId: 'thread-unread'
        }
      ])
    )
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)
    const router = TestBed.inject(Router)
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const normalAssistantButton = fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__item')[0]
    normalAssistantButton.click()

    expect(navigateSpy).toHaveBeenCalledWith(['/chat/x', 'other-assistant', 'c', 'thread-unread'])
  })

  it('loads and opens assistant result items from the expandable menu', async () => {
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)
    const router = TestBed.inject(Router)
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true)

    fixture.componentRef.setInput('embedded', true)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const toggle = fixture.nativeElement.querySelector('.cloud-sidebar-assistants__item-toggle')
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    toggle.click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(viewExtensionApi.getSlotViews).toHaveBeenCalledWith('agent', 'other-xpert', 'agent.workbench.fixed')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__children-label')).toHaveLength(1)
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__children-label').textContent).toContain(
      'XP.Sidebar.RecentConversations'
    )

    const child = fixture.nativeElement.querySelector('.cloud-sidebar-assistants__child-item')
    expect(child.textContent).toContain('未清销售订单')
    expect(child.querySelector('.icon-emoji')?.textContent).toContain('📦')
    child.click()

    expect(navigateSpy).toHaveBeenCalledWith(['/chat/x', 'other-assistant', 'c'], {
      queryParams: { view: 'sales-orders' }
    })

    toggle.click()
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__children')).toBeNull()
  })

  it('marks the assistant menu item matching the current view query as active', async () => {
    const router = TestBed.inject(Router)
    await router.navigateByUrl('/chat/x/other-assistant/c?view=sales-orders')

    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)
    fixture.componentRef.setInput('embedded', true)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const toggle = fixture.nativeElement.querySelector('.cloud-sidebar-assistants__item-toggle')
    toggle.click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const child = fixture.nativeElement.querySelector('.cloud-sidebar-assistants__child-item')
    expect(child.classList.contains('is-active')).toBe(true)
    expect(child.getAttribute('aria-current')).toBe('page')

    await router.navigateByUrl('/chat/x/other-assistant/c?view=another-view')
    fixture.detectChanges()

    expect(child.classList.contains('is-active')).toBe(false)
    expect(child.hasAttribute('aria-current')).toBe(false)
  })

  it('loads recent assistant conversations in pages of ten and opens older conversations', async () => {
    const today = new Date().toISOString()
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const firstPage = Array.from({ length: 10 }, (_, index) => ({
      id: `conversation-${index + 1}`,
      threadId: `thread-${index + 1}`,
      title: `Conversation ${index + 1}`,
      updatedAt: index < 5 ? today : yesterday,
      xpertId: 'other-xpert'
    }))
    conversationService.getSidebarConversations
      .mockReturnValueOnce(of({ items: firstPage, total: 12 }))
      .mockReturnValueOnce(
        of({
          items: [
            {
              id: 'conversation-11',
              threadId: 'thread-11',
              title: 'Conversation 11',
              updatedAt: yesterday,
              xpertId: 'other-xpert'
            },
            {
              id: 'conversation-12',
              threadId: 'thread-12',
              title: 'Conversation 12',
              updatedAt: yesterday,
              xpertId: 'other-xpert'
            }
          ],
          total: 12
        })
      )
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)
    const router = TestBed.inject(Router)
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true)

    fixture.componentRef.setInput('embedded', true)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__item-toggle').click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(conversationService.getSidebarConversations).toHaveBeenNthCalledWith(1, 'other-xpert', 10, 0)
    expect(fixture.nativeElement.querySelectorAll('xp-sidebar-conversation a')).toHaveLength(10)
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__conversation-group-label')).map(
        (item: Element) => item.textContent?.trim()
      )
    ).toEqual(['XP.KEY_WORDS.Date_Today', 'XP.KEY_WORDS.Date_Yesterday'])

    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__load-earlier').click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(conversationService.getSidebarConversations).toHaveBeenNthCalledWith(2, 'other-xpert', 10, 10)
    expect(fixture.nativeElement.querySelectorAll('xp-sidebar-conversation a')).toHaveLength(12)
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__load-earlier')).toBeNull()

    expect(fixture.nativeElement.querySelectorAll('xp-sidebar-conversation a')[10].getAttribute('href')).toBe(
      '/chat/x/other-assistant/c/thread-11'
    )
  })

  it('marks the recent conversation matching the route thread as active', async () => {
    conversationService.getSidebarConversations.mockReturnValue(
      of({
        items: [
          {
            id: 'conversation-active',
            threadId: 'thread-active',
            title: 'Active conversation',
            updatedAt: new Date().toISOString(),
            xpertId: 'other-xpert'
          }
        ],
        total: 1
      })
    )
    const router = TestBed.inject(Router)
    await router.navigateByUrl('/chat/x/other-assistant/c/thread-active')
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.componentRef.setInput('embedded', true)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__item-toggle').click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const activeConversation = fixture.nativeElement.querySelector('xp-sidebar-conversation a[aria-current="page"]')
    expect(activeConversation).not.toBeNull()
    expect(activeConversation.textContent).toContain('Active conversation')
    expect(activeConversation.getAttribute('aria-current')).toBe('page')
  })

  it('shows the view empty state when an assistant has no fixed views', async () => {
    viewExtensionApi.getSlotViews.mockReturnValue(of([]))
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.componentRef.setInput('embedded', true)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__item-toggle').click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__children-state').textContent).toContain(
      'XP.Sidebar.NoAssistantViews'
    )
  })

  it('routes normal assistant settings to the xpert studio page', async () => {
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)
    const router = TestBed.inject(Router)
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const normalAssistantSettingsButton = fixture.nativeElement.querySelectorAll(
      '.cloud-sidebar-assistants__settings'
    )[0]
    normalAssistantSettingsButton.click()

    expect(navigateSpy).toHaveBeenCalledWith(['/xpert/x', 'other-xpert', 'agents'])
  })

  it('routes the create shortcut to the selected workspace digital experts page', async () => {
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)
    const router = TestBed.inject(Router)
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const createButton = fixture.nativeElement.querySelector('.cloud-sidebar-assistants__create')

    expect(createButton).not.toBeNull()
    createButton.click()
    expect(navigateSpy).toHaveBeenCalledWith(['/xpert/w', 'workspace-1', 'xperts'])
  })

  it('hides the create shortcut without xpert edit permission', async () => {
    store.hasPermission.mockReturnValue(false)
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__create')).toBeNull()
  })

  it('hides assistant settings when the current user cannot edit the xpert workspace', async () => {
    assistantBindingService.getAvailableXperts.mockReturnValue(
      of([
        {
          id: 'other-xpert',
          slug: 'other-assistant',
          title: 'Other Assistant',
          description: 'Read-only assistant',
          latest: true,
          workspaceId: 'workspace-1',
          workspace: {
            capabilities: {
              canRead: true,
              canRun: true,
              canWrite: false,
              canManage: false
            }
          }
        },
        {
          id: 'bound-xpert',
          slug: 'personal-assistant',
          title: 'Personal Assistant',
          description: 'Bound read-only assistant',
          latest: true,
          workspaceId: 'workspace-1',
          workspace: {
            capabilities: {
              canRead: true,
              canRun: true,
              canWrite: false,
              canManage: false
            }
          }
        }
      ])
    )
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)
    const router = TestBed.inject(Router)
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__settings')).toHaveLength(0)

    fixture.componentInstance.openAssistantSettings(new MouseEvent('click'), {
      id: 'other-xpert',
      workspaceId: 'workspace-1',
      workspace: {
        capabilities: {
          canRead: true,
          canRun: true,
          canWrite: false,
          canManage: false
        }
      }
    } as any)

    expect(navigateSpy).not.toHaveBeenCalled()
  })

  it('renders assistant status dots only for assistants with unread messages', async () => {
    conversationService.getUnreadByXperts.mockReturnValue(
      of([
        {
          xpertId: 'other-xpert',
          unreadMessages: 2,
          unreadConversations: 1,
          latestUnreadAt: '2026-06-21T00:00:00.000Z',
          latestUnreadConversationId: 'conversation-unread',
          latestUnreadThreadId: 'thread-unread'
        }
      ])
    )
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__status')).toHaveLength(1)
  })

  it('polls unread summaries every 2 seconds while the page is visible', fakeAsync(() => {
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    tick()

    expect(conversationService.getUnreadByXperts).toHaveBeenCalledTimes(1)

    tick(1_999)
    expect(conversationService.getUnreadByXperts).toHaveBeenCalledTimes(1)

    tick(1)
    expect(conversationService.getUnreadByXperts).toHaveBeenCalledTimes(2)

    fixture.destroy()
    discardPeriodicTasks()
  }))

  it('pauses unread polling while hidden and refreshes immediately when visible again', fakeAsync(() => {
    documentVisibilityState = 'hidden'
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    tick()

    expect(conversationService.getUnreadByXperts).not.toHaveBeenCalled()

    tick(2_000)
    expect(conversationService.getUnreadByXperts).not.toHaveBeenCalled()

    documentVisibilityState = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))

    expect(conversationService.getUnreadByXperts).toHaveBeenCalledTimes(1)

    tick(2_000)
    expect(conversationService.getUnreadByXperts).toHaveBeenCalledTimes(2)

    fixture.destroy()
    discardPeriodicTasks()
  }))

  it('does not overlap unread summary requests when a prior request is still pending', fakeAsync(() => {
    const pendingUnread = new Subject<unknown>()
    conversationService.getUnreadByXperts.mockReturnValue(pendingUnread.asObservable())
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    tick()

    expect(conversationService.getUnreadByXperts).toHaveBeenCalledTimes(1)

    tick(120_000)
    conversationService.unreadRefresh$.next()

    expect(conversationService.getUnreadByXperts).toHaveBeenCalledTimes(1)

    pendingUnread.next([])
    pendingUnread.complete()
    conversationService.getUnreadByXperts.mockReturnValue(of([]))
    conversationService.unreadRefresh$.next()

    expect(conversationService.getUnreadByXperts).toHaveBeenCalledTimes(2)

    fixture.destroy()
    discardPeriodicTasks()
  }))

  it('normalizes wrapped unread responses and ignores invalid unread payloads', async () => {
    conversationService.getUnreadByXperts.mockReturnValueOnce(
      of({
        items: [
          {
            xpertId: 'other-xpert',
            unreadMessages: 1,
            unreadConversations: 1,
            latestUnreadAt: '2026-06-21T00:00:00.000Z',
            latestUnreadConversationId: 'conversation-unread',
            latestUnreadThreadId: 'thread-unread'
          }
        ]
      })
    )
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__status')).toHaveLength(1)

    conversationService.getUnreadByXperts.mockReturnValueOnce(of({}))
    conversationService.unreadRefresh$.next()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__status')).toHaveLength(0)
  })
})
