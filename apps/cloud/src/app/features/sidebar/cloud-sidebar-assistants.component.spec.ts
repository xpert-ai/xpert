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

  it('hides the current ClawXpert assistant from the normal assistant list', async () => {
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const names = Array.from(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__name')).map((item) =>
      item.textContent.trim()
    )
    const descriptions = Array.from(
      fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__description')
    ).map((item) => item.textContent.trim())

    expect(names).toEqual(['Other Assistant'])
    expect(descriptions).toEqual(['General workbench assistant'])
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__subtitle').textContent).toContain('1')
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__filters')).toBeNull()
    expect(assistantBindingService.getAvailableXperts).toHaveBeenCalledWith('user', 'clawxpert')
  })

  it('reloads available assistants after an xpert publish refresh event', async () => {
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    assistantBindingService.getAvailableXperts.mockReturnValue(
      of([
        {
          id: 'published-xpert',
          slug: 'published-assistant',
          title: 'Published Assistant',
          businessArea: { name: 'Operations' },
          latest: true
        },
        {
          id: 'bound-xpert',
          slug: 'personal-assistant',
          title: 'Personal Assistant',
          latest: true
        }
      ])
    )

    xpertRefresh$.next()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const names = Array.from(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__name')).map((item) =>
      item.textContent.trim()
    )

    expect(names).toEqual(['Operations / Published Assistant'])
    expect(assistantBindingService.getAvailableXperts).toHaveBeenCalledTimes(2)
  })

  it('filters all assistants by a clicked business area and clears the filter from the header tag', async () => {
    assistantBindingService.get.mockReturnValue(of(null))
    assistantBindingService.getAvailableXperts.mockReturnValue(
      of([
        {
          id: 'sales-one',
          title: 'Sales One',
          businessAreaId: 'sales',
          businessArea: { id: 'sales', name: '销售' },
          latest: true
        },
        {
          id: 'operations-one',
          title: 'Operations One',
          businessAreaId: 'operations',
          businessArea: { id: 'operations', name: '运营' },
          latest: true
        },
        {
          id: 'sales-two',
          title: 'Sales Two',
          businessAreaId: 'sales',
          businessArea: { id: 'sales', name: '销售' },
          latest: true
        }
      ])
    )
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)
    fixture.componentRef.setInput('embedded', true)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const names = () =>
      Array.from(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__name')).map((item) =>
        item.textContent.replace(/\s+/g, ' ').trim()
      )

    expect(names()).toEqual(['销售 / Sales One', '运营 / Operations One', '销售 / Sales Two'])

    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__business-area-link').click()
    fixture.detectChanges()

    expect(fixture.componentInstance.activeBusinessAreaFilter()).toEqual({ id: 'sales', name: '销售' })
    expect(names()).toEqual(['销售 / Sales One', '销售 / Sales Two'])
    expect(
      fixture.nativeElement.querySelector('.cloud-sidebar-assistants__business-area-filter').textContent
    ).toContain('销售')
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__subtitle').textContent).toContain('2')

    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__business-area-filter').click()
    fixture.detectChanges()

    expect(fixture.componentInstance.activeBusinessAreaFilter()).toBeNull()
    expect(names()).toEqual(['销售 / Sales One', '运营 / Operations One', '销售 / Sales Two'])
  })

  it('renders the latest conversation title in the assistant description row', async () => {
    conversationService.getUnreadByXperts.mockReturnValue(
      of([
        {
          xpertId: 'other-xpert',
          unreadMessages: 0,
          unreadConversations: 0,
          latestConversationAt: '2026-06-21T00:05:00.000Z',
          latestConversationId: 'conversation-latest',
          latestConversationThreadId: 'thread-latest',
          latestConversationTitle: 'Latest planning chat'
        }
      ])
    )
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__description').textContent.trim()).toBe(
      'Latest planning chat'
    )
  })

  it('renders the current bound ClawXpert card from the existing expert source', async () => {
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.componentRef.setInput('mode', 'current-card')
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__current-card')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__current-name').textContent.trim()).toBe(
      'Personal Assistant'
    )
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__list')).toBeNull()
    expect(assistantBindingService.get).toHaveBeenCalledWith('clawxpert', 'user')
    expect(assistantBindingService.getAvailableXperts).toHaveBeenCalledWith('user', 'clawxpert')
  })

  it('loads tenant-scoped assistants when the active sidebar scope is tenant', async () => {
    store.organizationId = null
    store.selectOrganizationId.mockReturnValue(of(null))
    scopeService.activeScope.set({ level: 'tenant' })
    assistantBindingService.getAvailableXperts.mockReturnValue(
      of([
        {
          id: 'tenant-xpert',
          slug: 'tenant-assistant',
          title: 'Tenant Assistant',
          description: 'Tenant-level assistant',
          latest: true
        }
      ])
    )
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const names = Array.from(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__name')).map((item) =>
      item.textContent.trim()
    )

    expect(fixture.componentInstance.shouldRender()).toBe(true)
    expect(names).toEqual(['Tenant Assistant'])
    expect(assistantBindingService.get).not.toHaveBeenCalled()
    expect(assistantBindingService.getAvailableXperts).toHaveBeenCalledWith('tenant', 'chat_common')
  })

  it('shows setup status and routes setup actions when ClawXpert is not bound', async () => {
    assistantBindingService.get.mockReturnValue(of(null))
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)
    const router = TestBed.inject(Router)
    const navigateByUrlSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true)

    fixture.componentRef.setInput('mode', 'current-card')
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const statusText = fixture.nativeElement.querySelector('.cloud-sidebar-assistants__current-status').textContent
    const actionText = fixture.nativeElement.querySelector(
      '.cloud-sidebar-assistants__current-action--primary'
    ).textContent

    expect(statusText).toContain('XP.Assistant.NotConfigured')
    expect(statusText).not.toContain('XP.Assistant.Online')
    expect(actionText).toContain('XP.Assistant.Configure')
    expect(actionText).not.toContain('XP.Assistant.NewConversation')

    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__current-main').click()
    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__current-action--primary').click()
    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__current-config').click()

    expect(navigateByUrlSpy).toHaveBeenCalledTimes(3)
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/chat/clawxpert')
  })

  it('refreshes the current ClawXpert card after the binding changes', async () => {
    let currentBinding: { assistantId: string } | null = null
    assistantBindingService.get.mockImplementation(() => of(currentBinding))

    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.componentRef.setInput('mode', 'current-card')
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__current-status').textContent).toContain(
      'XP.Assistant.NotConfigured'
    )

    currentBinding = { assistantId: 'bound-xpert' }
    assistantBindingChanges$.next({ code: 'clawxpert', scope: 'user' })
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const statusText = fixture.nativeElement.querySelector('.cloud-sidebar-assistants__current-status').textContent
    const actionText = fixture.nativeElement.querySelector(
      '.cloud-sidebar-assistants__current-action--primary'
    ).textContent

    expect(statusText).toContain('XP.Assistant.Online')
    expect(statusText).not.toContain('XP.Assistant.NotConfigured')
    expect(actionText).toContain('XP.Assistant.NewConversation')
    expect(assistantBindingService.get).toHaveBeenCalledTimes(2)
  })

  it('routes the current ClawXpert card actions without changing the binding', async () => {
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)
    const router = TestBed.inject(Router)
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true)
    const navigateByUrlSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true)

    fixture.componentRef.setInput('mode', 'current-card')
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__current-main').click()
    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__current-action--primary').click()
    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__current-config').click()

    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__current-config i').className).toContain(
      'ri-equalizer-2-line'
    )
    expect(
      fixture.nativeElement.querySelector('.cloud-sidebar-assistants__current-action--primary z-icon')
    ).not.toBeNull()
    expect(navigateSpy).toHaveBeenCalledWith(['/chat/x', 'personal-assistant', 'c'])
    expect(navigateSpy).toHaveBeenCalledWith(['/chat/clawxpert', 'c'])
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/chat/clawxpert')
  })

  it('shows only five assistants by default and expands the remaining assistants on demand', async () => {
    assistantBindingService.getAvailableXperts.mockReturnValue(
      of([
        {
          id: 'assistant-1',
          slug: 'assistant-1',
          title: 'Assistant 1',
          latest: true
        },
        {
          id: 'assistant-2',
          slug: 'assistant-2',
          title: 'Assistant 2',
          latest: true
        },
        {
          id: 'assistant-3',
          slug: 'assistant-3',
          title: 'Assistant 3',
          latest: true
        },
        {
          id: 'assistant-4',
          slug: 'assistant-4',
          title: 'Assistant 4',
          latest: true
        },
        {
          id: 'assistant-5',
          slug: 'assistant-5',
          title: 'Assistant 5',
          latest: true
        },
        {
          id: 'assistant-6',
          slug: 'assistant-6',
          title: 'Assistant 6',
          latest: true
        },
        {
          id: 'bound-xpert',
          slug: 'personal-assistant',
          title: 'Personal Assistant',
          latest: true
        }
      ])
    )
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const names = () =>
      Array.from(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__name')).map((item) =>
        item.textContent.trim()
      )

    expect(names()).toEqual(['Assistant 1', 'Assistant 2', 'Assistant 3', 'Assistant 4', 'Assistant 5'])
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__more-count')).toBeNull()
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__more-chevron')).toBeNull()
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__more').textContent).toContain(
      'XP.Assistant.MoreDigitalExperts'
    )

    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__more').click()
    fixture.detectChanges()

    expect(names()).toEqual(['Assistant 1', 'Assistant 2', 'Assistant 3', 'Assistant 4', 'Assistant 5', 'Assistant 6'])
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__more').textContent).toContain(
      'XP.Assistant.CollapseDigitalExperts'
    )

    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__more').click()
    fixture.detectChanges()

    expect(names()).toEqual(['Assistant 1', 'Assistant 2', 'Assistant 3', 'Assistant 4', 'Assistant 5'])
  })

  it('persists drag ordering in local storage and restores it for the same user scope', async () => {
    assistantBindingService.getAvailableXperts.mockReturnValue(
      of([
        {
          id: 'assistant-1',
          slug: 'assistant-1',
          title: 'Assistant 1',
          latest: true
        },
        {
          id: 'assistant-2',
          slug: 'assistant-2',
          title: 'Assistant 2',
          latest: true
        },
        {
          id: 'assistant-3',
          slug: 'assistant-3',
          title: 'Assistant 3',
          latest: true
        },
        {
          id: 'bound-xpert',
          slug: 'personal-assistant',
          title: 'Personal Assistant',
          latest: true
        }
      ])
    )
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    fixture.componentInstance.reorderAssistants(0, 2)
    fixture.detectChanges()

    const names = () =>
      Array.from(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__name')).map((item) =>
        item.textContent.trim()
      )

    expect(names()).toEqual(['Assistant 2', 'Assistant 3', 'Assistant 1'])
    expect(localStorage.getItem(ASSISTANT_ORDER_STORAGE_KEY)).toBe(
      JSON.stringify(['assistant-2', 'assistant-3', 'assistant-1'])
    )

    fixture.destroy()

    const restoredFixture = TestBed.createComponent(CloudSidebarAssistantsComponent)
    restoredFixture.detectChanges()
    await restoredFixture.whenStable()
    restoredFixture.detectChanges()

    expect(
      Array.from(restoredFixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__name')).map((item) =>
        item.textContent.trim()
      )
    ).toEqual(['Assistant 2', 'Assistant 3', 'Assistant 1'])
  })

  it('builds category filters from assistant tags', async () => {
    assistantBindingService.getAvailableXperts.mockReturnValue(
      of([
        {
          id: 'other-xpert',
          slug: 'other-assistant',
          title: 'Other Assistant',
          latest: true,
          tags: [{ name: 'Finance' }, { name: 'Support' }],
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
          latest: true,
          tags: [{ name: 'Team' }],
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
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.componentInstance.categories().map((category) => category.value)).toEqual([
      'all',
      'finance',
      'support'
    ])
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__filter')).map((item) =>
        item.textContent.trim()
      )
    ).toEqual(['XP.Assistant.CategoryAll', 'Finance', 'Support'])
  })

  it('keeps the assistant section visible when the selected category no longer exists', async () => {
    assistantBindingService.get.mockReturnValue(of(null))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([]))
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    fixture.componentInstance.selectCategory('missing-tag')
    fixture.detectChanges()

    expect(fixture.componentInstance.activeCategory()).toBe('all')
    expect(fixture.componentInstance.shouldRender()).toBe(true)
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__filters')).toBeNull()
  })

  it('does not expose filters that only match the hidden current assistant', async () => {
    assistantBindingService.getAvailableXperts.mockReturnValue(
      of([
        {
          id: 'other-xpert',
          slug: 'other-assistant',
          title: 'Other Assistant',
          latest: true,
          tags: [{ name: 'Finance' }],
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
          latest: true,
          tags: [{ name: 'Team' }],
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
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    fixture.componentInstance.selectCategory('team')
    fixture.detectChanges()

    const names = Array.from(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__name')).map((item) =>
      item.textContent.trim()
    )

    expect(fixture.componentInstance.activeCategory()).toBe('all')
    expect(names).toEqual(['Other Assistant'])
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__filters')).toBeNull()
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__empty')).toBeNull()
  })

  it('hides only the bound ClawXpert from the normal assistant list', async () => {
    assistantBindingService.getAvailableXperts.mockReturnValue(
      of([
        {
          id: 'other-xpert',
          slug: 'other-assistant',
          title: 'Other Assistant',
          latest: true
        },
        {
          id: 'bound-xpert',
          slug: 'personal-assistant',
          title: 'Personal Assistant',
          latest: true
        },
        {
          id: 'builtin-clawxpert',
          slug: 'clawxpert',
          title: 'Claw Xpert',
          latest: true
        }
      ])
    )
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const names = Array.from(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__name')).map((item) =>
      item.textContent.trim()
    )

    expect(names).toEqual(['Other Assistant', 'Claw Xpert'])
  })
})
