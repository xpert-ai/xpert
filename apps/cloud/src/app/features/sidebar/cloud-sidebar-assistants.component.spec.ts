import { Component, signal, type WritableSignal } from '@angular/core'
import { discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, Observable, of, Subject } from 'rxjs'
import {
  AiFeatureEnum,
  AssistantBindingService,
  ChatConversationService,
  ScopeService,
  Store,
  XpertAPIService
} from '../../@core'
import { CloudSidebarAssistantsComponent } from './cloud-sidebar-assistants.component'
import {
  type AssistantXpertLike,
  filterAssistantXperts,
  getAssistantDescription,
  getAssistantLabel,
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

  return {
    AiFeatureEnum: {
      FEATURE_XPERT: 'FEATURE_XPERT',
      FEATURE_XPERT_CLAWXPERT: 'FEATURE_XPERT_CLAWXPERT',
      FEATURE_XPERT_CHATBI: 'FEATURE_XPERT_CHATBI'
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
      CHATBI: 'chatbi',
      CLAWXPERT: 'clawxpert'
    },
    RequestScopeLevel: {
      TENANT: 'tenant',
      ORGANIZATION: 'organization'
    },
    AssistantBindingService,
    ChatConversationService,
    ScopeService: class ScopeService {},
    Store,
    XpertAPIService
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

function xpert(item: Partial<AssistantXpertLike>): AssistantXpertLike {
  return item
}

describe('cloud sidebar assistants helpers', () => {
  it('keeps latest unique xperts with an id', () => {
    const items = normalizeAssistantXperts([
      xpert({ id: 'a', slug: 'alpha' }),
      xpert({ id: 'a', slug: 'alpha-copy' }),
      xpert({ id: 'b', latest: false }),
      xpert({ slug: 'missing-id' })
    ])

    expect(items.map((item) => item.slug)).toEqual(['alpha'])
  })

  it('uses the expected label, description and route id fallbacks', () => {
    const item = xpert({
      id: 'assistant-id',
      slug: 'assistant-slug',
      name: 'Assistant Name',
      titleCN: '中文标题'
    })

    expect(getAssistantLabel(item)).toBe('中文标题')
    expect(getAssistantDescription(item)).toBe('Assistant Name')
    expect(getAssistantRouteId(item)).toBe('assistant-slug')
  })

  it('filters assistants by label or description', () => {
    const items = [
      xpert({ id: 'documents', title: 'Documents Assistant', description: 'Word and sheets' }),
      xpert({ id: 'tools', title: 'Tool Runner', description: 'Workspace calls' })
    ]

    expect(filterAssistantXperts(items, 'sheet').map((item) => item.id)).toEqual(['documents'])
    expect(filterAssistantXperts(items, 'tool').map((item) => item.id)).toEqual(['tools'])
  })

  it('places assistants missing from the saved order first by newest creation time', () => {
    const items = [
      xpert({ id: 'ordered-first', createdAt: new Date('2026-01-03T00:00:00Z') }),
      xpert({ id: 'newer', createdAt: new Date('2026-01-05T00:00:00Z') }),
      xpert({ id: 'ordered-second', createdAt: new Date('2026-01-04T00:00:00Z') }),
      xpert({ id: 'newest', createdAt: new Date('2026-01-06T00:00:00Z') })
    ]

    expect(orderAssistantXperts(items, ['ordered-first', 'ordered-second']).map((item) => item.id)).toEqual([
      'newest',
      'newer',
      'ordered-first',
      'ordered-second'
    ])
  })

  it('orders all assistants by newest creation time when no saved order exists', () => {
    const items = [
      xpert({ id: 'oldest', createdAt: new Date('2026-01-01T00:00:00Z') }),
      xpert({ id: 'newest', createdAt: new Date('2026-01-03T00:00:00Z') }),
      xpert({ id: 'middle', createdAt: new Date('2026-01-02T00:00:00Z') })
    ]

    expect(orderAssistantXperts(items, []).map((item) => item.id)).toEqual(['newest', 'middle', 'oldest'])
  })

  it('matches assistant categories from tag names instead of label or description keywords', () => {
    const items = [
      xpert({ id: 'finance', title: 'General Assistant', tags: [{ name: 'Finance' }] }),
      xpert({ id: 'support', title: 'General Assistant', tags: [{ name: 'Support' }] }),
      xpert({
        id: 'untagged',
        title: 'Finance Support Assistant',
        description: 'report ticket workflow',
        tags: []
      })
    ]

    expect(filterAssistantXperts(items, '', 'finance').map((item) => item.id)).toEqual(['finance'])
    expect(filterAssistantXperts(items, '', 'support').map((item) => item.id)).toEqual(['support'])
  })

  it('does not use tag labels as category identity', () => {
    const items = [xpert({ id: 'localized-tag', tags: [{ name: 'finance', label: { zh: '财务' } }] })]

    expect(filterAssistantXperts(items, '', 'finance').map((item) => item.id)).toEqual(['localized-tag'])
    expect(filterAssistantXperts(items, '', '财务')).toEqual([])
  })

  it('matches exact normalized tag names without aliases', () => {
    const items = [xpert({ id: 'localized-tag', tags: [{ name: '财务' }] })]

    expect(filterAssistantXperts(items, '', 'finance')).toEqual([])
    expect(filterAssistantXperts(items, '', '财务').map((item) => item.id)).toEqual(['localized-tag'])
  })

  it('does not infer categories from titles or descriptions', () => {
    const items = [
      xpert({
        id: 'keyword-only',
        title: 'Finance Support Assistant',
        description: 'Handles finance tickets',
        tags: []
      })
    ]

    expect(filterAssistantXperts(items, '', 'finance')).toEqual([])
    expect(filterAssistantXperts(items, '', 'support')).toEqual([])
  })

  it('keeps untagged assistants visible only in the all category', () => {
    const items = [
      xpert({
        id: 'untagged',
        title: 'Finance Support Assistant',
        description: 'report ticket workflow'
      })
    ]

    expect(filterAssistantXperts(items, '', 'all').map((item) => item.id)).toEqual(['untagged'])
    expect(filterAssistantXperts(items, '', 'finance')).toEqual([])
    expect(filterAssistantXperts(items, '', 'support')).toEqual([])
  })

  it('matches the active assistant route', () => {
    const item = xpert({ id: 'assistant-id', slug: 'mcp-tools-agent-01' })

    expect(isAssistantRouteActive('/chat/x/mcp-tools-agent-01/c', item)).toBe(true)
    expect(isAssistantRouteActive('/chat/x/common/c', item)).toBe(false)
  })
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
    unreadRefresh$: Subject<void>
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
      unreadRefresh$: new Subject<void>()
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

    expect(names).toEqual(['Published Assistant'])
    expect(assistantBindingService.getAvailableXperts).toHaveBeenCalledTimes(2)
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

    expect(statusText).toContain('PAC.Assistant.NotConfigured')
    expect(statusText).not.toContain('PAC.Assistant.Online')
    expect(actionText).toContain('PAC.Assistant.Configure')
    expect(actionText).not.toContain('PAC.Assistant.NewConversation')

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
      'PAC.Assistant.NotConfigured'
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

    expect(statusText).toContain('PAC.Assistant.Online')
    expect(statusText).not.toContain('PAC.Assistant.NotConfigured')
    expect(actionText).toContain('PAC.Assistant.NewConversation')
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
      'PAC.Assistant.MoreDigitalExperts'
    )

    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__more').click()
    fixture.detectChanges()

    expect(names()).toEqual(['Assistant 1', 'Assistant 2', 'Assistant 3', 'Assistant 4', 'Assistant 5', 'Assistant 6'])
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__more').textContent).toContain(
      'PAC.Assistant.CollapseDigitalExperts'
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
    ).toEqual(['PAC.Assistant.CategoryAll', 'Finance', 'Support'])
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

  it('keeps normal assistant rows on the assistant chat route', async () => {
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)
    const router = TestBed.inject(Router)
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const normalAssistantButton = fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__item-main')[0]
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

    const normalAssistantButton = fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__item-main')[0]
    normalAssistantButton.click()

    expect(navigateSpy).toHaveBeenCalledWith(['/chat/x', 'other-assistant', 'c', 'thread-unread'])
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
