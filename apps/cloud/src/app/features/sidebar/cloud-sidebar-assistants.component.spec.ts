import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { of, Subject } from 'rxjs'
import { AiFeatureEnum, AssistantBindingService, ChatConversationService, Store } from '../../@core'
import { CloudSidebarAssistantsComponent } from './cloud-sidebar-assistants.component'
import {
  type AssistantXpertLike,
  filterAssistantXperts,
  getAssistantDescription,
  getAssistantLabel,
  getAssistantRouteId,
  isAssistantRouteActive,
  normalizeAssistantXperts
} from './cloud-sidebar-assistants.utils'

jest.mock('@xpert-ai/headless-ui', () => {
  const { Directive, Input } = jest.requireActual('@angular/core')

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
    ZardTooltipImports: [ZTooltipDirective]
  }
})

jest.mock('../../@core', () => {
  class AssistantBindingService {}
  class ChatConversationService {}
  class Store {}

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
      USER: 'user'
    },
    AssistantCode: {
      CHAT_COMMON: 'chat_common',
      XPERT_SHARED: 'xpert_shared',
      CHATBI: 'chatbi',
      CLAWXPERT: 'clawxpert'
    },
    AssistantBindingService,
    ChatConversationService,
    Store
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

describe('CloudSidebarAssistantsComponent', () => {
  let assistantBindingService: {
    get: jest.Mock
    getAvailableXperts: jest.Mock
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
    featureContextHydrated$: ReturnType<typeof of<boolean>>
    featureContextHydrated: boolean
    hasFeatureEnabled: jest.Mock
    hasPermission: jest.Mock
  }

  beforeEach(async () => {
    assistantBindingService = {
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
      featureContextHydrated$: of(true),
      featureContextHydrated: true,
      hasFeatureEnabled: jest.fn((feature: string) =>
        [AiFeatureEnum.FEATURE_XPERT, AiFeatureEnum.FEATURE_XPERT_CLAWXPERT].includes(feature as AiFeatureEnum)
      ),
      hasPermission: jest.fn((permission: string) => permission === 'XPERT_EDIT')
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

  it('pins the bound ClawXpert assistant first and removes it from the normal list', async () => {
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const names = Array.from(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__name')).map((item) =>
      item.textContent.trim()
    )

    expect(names).toEqual(['Personal Assistant', 'Other Assistant'])
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__subtitle').textContent).toContain('2')
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
      'team',
      'finance',
      'support'
    ])
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__filter')).map((item) =>
        item.textContent.trim()
      )
    ).toEqual(['PAC.Assistant.CategoryAll', 'Team', 'Finance', 'Support'])
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
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__filter.is-active').textContent.trim()).toBe(
      'PAC.Assistant.CategoryAll'
    )
  })

  it('does not show the empty state when a tag only matches the pinned ClawXpert assistant', async () => {
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

    expect(names).toEqual(['Personal Assistant'])
    expect(fixture.nativeElement.querySelector('.cloud-sidebar-assistants__empty')).toBeNull()
  })

  it('routes the pinned ClawXpert item to chat and its settings button to configuration', async () => {
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)
    const router = TestBed.inject(Router)
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true)
    const navigateByUrlSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__item-main').click()
    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__settings').click()

    expect(navigateSpy).toHaveBeenCalledWith(['/chat/clawxpert', 'c'])
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/chat/clawxpert')
  })

  it('keeps normal assistant rows on the assistant chat route', async () => {
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)
    const router = TestBed.inject(Router)
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const normalAssistantButton = fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__item-main')[1]
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

    const normalAssistantButton = fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__item-main')[1]
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
    )[1]
    normalAssistantSettingsButton.click()

    expect(navigateSpy).toHaveBeenCalledWith(['/xpert/x', 'other-xpert', 'agents'])
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
