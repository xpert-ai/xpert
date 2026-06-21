import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
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
      xpert({ id: 'office', title: 'Office Assistant', description: 'Word and sheets' }),
      xpert({ id: 'tools', title: 'MCP Tools', description: 'Workspace calls' })
    ]

    expect(filterAssistantXperts(items, 'sheet').map((item) => item.id)).toEqual(['office'])
    expect(filterAssistantXperts(items, 'mcp').map((item) => item.id)).toEqual(['tools'])
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
    unreadRefresh$: unknown
  }
  let store: {
    organizationId: string | null
    selectOrganizationId: jest.Mock
    featureContextHydrated$: ReturnType<typeof of<boolean>>
    featureContextHydrated: boolean
    hasFeatureEnabled: jest.Mock
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
            latest: true
          },
          {
            id: 'bound-xpert',
            slug: 'personal-assistant',
            title: 'Personal Assistant',
            description: 'Bound ClawXpert assistant',
            latest: true
          }
        ])
      )
    }
    conversationService = {
      getUnreadByXperts: jest.fn(() => of([])),
      unreadRefresh$: of(undefined)
    }
    store = {
      organizationId: 'org-1',
      selectOrganizationId: jest.fn(() => of('org-1')),
      featureContextHydrated$: of(true),
      featureContextHydrated: true,
      hasFeatureEnabled: jest.fn((feature: string) =>
        [AiFeatureEnum.FEATURE_XPERT, AiFeatureEnum.FEATURE_XPERT_CLAWXPERT].includes(feature as AiFeatureEnum)
      )
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

  it('routes the pinned ClawXpert item to chat and its settings button to configuration', async () => {
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)
    const router = TestBed.inject(Router)
    const navigateByUrlSpy = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__item-main').click()
    fixture.nativeElement.querySelector('.cloud-sidebar-assistants__settings').click()

    expect(navigateByUrlSpy).toHaveBeenNthCalledWith(1, '/chat/clawxpert/c')
    expect(navigateByUrlSpy).toHaveBeenNthCalledWith(2, '/chat/clawxpert')
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

  it('renders assistant status dots only for assistants with unread messages', async () => {
    conversationService.getUnreadByXperts.mockReturnValue(
      of([
        {
          xpertId: 'other-xpert',
          unreadMessages: 2,
          unreadConversations: 1,
          latestUnreadAt: '2026-06-21T00:00:00.000Z'
        }
      ])
    )
    const fixture = TestBed.createComponent(CloudSidebarAssistantsComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelectorAll('.cloud-sidebar-assistants__status')).toHaveLength(1)
  })
})
