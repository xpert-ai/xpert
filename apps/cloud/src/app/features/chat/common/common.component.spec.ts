import { inject, input, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject } from 'rxjs'
import { ChatCommonAssistantComponent } from './common.component'
import { ChatCommonService } from './common-chat.service'
import { ChatHomeService } from '../home.service'

jest.mock('apps/cloud/src/app/@core', () => {
  return {
    AssistantCode: {
      CHAT_COMMON: 'chat_common',
      XPERT_SHARED: 'xpert_shared',
      CHATBI: 'chatbi',
      CLAWXPERT: 'clawxpert'
    },
    AiFeatureEnum: {
      FEATURE_XPERT: 'FEATURE_XPERT',
      FEATURE_XPERT_CHATBI: 'FEATURE_XPERT_CHATBI',
      FEATURE_XPERT_CLAWXPERT: 'FEATURE_XPERT_CLAWXPERT'
    },
    RolesEnum: {
      SUPER_ADMIN: 'SUPER_ADMIN',
      ADMIN: 'ADMIN'
    },
    Store: class Store {}
  }
})

jest.mock('../../../@core/providers/ocap', () => ({
  provideOcap: jest.fn(() => [])
}))

jest.mock('@xpert-ai/ocap-angular/core', () => ({
  provideOcapCore: jest.fn(() => [])
}))

jest.mock('../../../xpert', () => {
  const angularCore = jest.requireActual('@angular/core')

  class ChatService {
    readonly conversationId = signal<string | null>(null)
    readonly messages = signal<unknown[]>([])
  }
  class XpertOcapService {}
  class XpertChatAppComponent {
    readonly idleLayout = input<'xpert' | 'welcome'>('xpert')
    readonly chatService = inject(ChatService)
  }

  angularCore.Component({
    selector: 'xpert-webapp',
    standalone: true,
    template: `
      <div data-testid="xpert-webapp" [attr.data-idle-layout]="idleLayout()">
        <div data-testid="xpert-webapp-content">
          @if (!chatService.conversationId() && !chatService.messages().length) {
            <ng-content></ng-content>
          } @else {
            <div data-testid="conversation-view"></div>
          }
        </div>
        <div data-testid="xpert-webapp-action">
          <ng-content select="[action]"></ng-content>
        </div>
      </div>
    `
  })(XpertChatAppComponent)

  return {
    ChatService,
    XpertChatAppComponent,
    XpertOcapService
  }
})

jest.mock('../../../@shared/avatar', () => {
  const angularCore = jest.requireActual('@angular/core')

  class EmojiAvatarComponent {}

  angularCore.Component({
    selector: 'emoji-avatar',
    standalone: true,
    template: ''
  })(EmojiAvatarComponent)

  return {
    EmojiAvatarComponent
  }
})

jest.mock('../xperts/xperts.component', () => {
  const angularCore = jest.requireActual('@angular/core')

  class ChatXpertsComponent {}

  angularCore.Component({
    selector: 'pac-chat-xperts',
    standalone: true,
    template: ''
  })(ChatXpertsComponent)

  return {
    ChatXpertsComponent
  }
})

jest.mock('../../assistant/assistant-chatkit.runtime', () => {
  const { signal } = jest.requireActual('@angular/core')

  const runtimeState = {
    config: signal(null),
    hasSource: signal(false),
    isConfigured: signal(false),
    loading: signal(false),
    refresh: jest.fn(),
    status: signal('missing')
  }

  return {
    injectAssistantBindingRuntimeState: jest.fn(() => runtimeState),
    __runtimeState: runtimeState
  }
})

jest.mock('./common-chat.service', () => {
  const { signal } = jest.requireActual('@angular/core')

  class ChatCommonService {
    readonly conversationId = signal<string | null>(null)
    readonly messages = signal<unknown[]>([])
    readonly assistantId = signal<string | null>(null)
    readonly xpert = signal(null)
    readonly newConv = jest.fn(() => {
      this.conversationId.set(null)
      this.messages.set([])
    })
    readonly setAssistantId = jest.fn(async (assistantId: string | null) => {
      this.assistantId.set(assistantId)
    })
  }

  return {
    ChatCommonService
  }
})

const runtimeState = jest.requireMock('../../assistant/assistant-chatkit.runtime').__runtimeState as {
  config: ReturnType<typeof import('@angular/core').signal<unknown>>
  hasSource: ReturnType<typeof import('@angular/core').signal<boolean>>
  isConfigured: ReturnType<typeof import('@angular/core').signal<boolean>>
  loading: ReturnType<typeof import('@angular/core').signal<boolean>>
  status: ReturnType<typeof import('@angular/core').signal<string>>
}
const { RolesEnum, Store } = jest.requireMock('apps/cloud/src/app/@core') as {
  RolesEnum: {
    SUPER_ADMIN: string
    ADMIN: string
  }
  Store: new (...args: unknown[]) => unknown
}

describe('ChatCommonAssistantComponent', () => {
  let router: Router
  let user$: BehaviorSubject<{
    role?: {
      name?: string | null
    } | null
  } | null>
  let service: ChatCommonService & {
    newConv: jest.Mock
    setAssistantId: jest.Mock
    conversationId: ReturnType<typeof import('@angular/core').signal<string | null>>
    messages: ReturnType<typeof import('@angular/core').signal<unknown[]>>
    assistantId: ReturnType<typeof import('@angular/core').signal<string | null>>
    xpert: ReturnType<typeof import('@angular/core').signal<unknown>>
  }

  beforeEach(() => {
    runtimeState.config.set(null)
    runtimeState.hasSource.set(false)
    runtimeState.isConfigured.set(false)
    runtimeState.loading.set(false)
    runtimeState.status.set('missing')
    user$ = new BehaviorSubject(null)

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ChatCommonAssistantComponent],
      providers: [
        provideRouter([]),
        {
          provide: ChatHomeService,
          useValue: {
            sortedXperts: signal([])
          }
        },
        {
          provide: Store,
          useValue: {
            user$: user$.asObservable()
          }
        }
      ]
    })

    router = TestBed.inject(Router)
    service = TestBed.inject(ChatCommonService) as typeof service
    Object.defineProperty(router, 'url', {
      configurable: true,
      get: () => '/chat/x/common'
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('renders a missing-config empty state', () => {
    runtimeState.status.set('missing')

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('PAC.Assistant.MissingTitle')
  })

  it('renders a disabled assistant empty state', () => {
    runtimeState.status.set('disabled')

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('PAC.Assistant.DisabledTitle')
  })

  it('renders an error empty state when the assistant config fails to load', () => {
    runtimeState.status.set('error')

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('PAC.Assistant.LoadFailed')
  })

  it('renders the merged common shell with welcome content when ready', () => {
    runtimeState.status.set('ready')
    runtimeState.config.set({
      assistantId: 'assistant-1',
      sourceScope: 'tenant',
      enabled: true
    })
    service.xpert.set({
      id: 'assistant-1',
      title: 'Common Assistant'
    })

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    expect(service.setAssistantId).toHaveBeenCalledWith('assistant-1')
    expect(fixture.nativeElement.querySelector('[data-testid="xpert-webapp"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('[data-testid="xpert-webapp"]').getAttribute('data-idle-layout')).toBe(
      'welcome'
    )
    expect(fixture.nativeElement.querySelector('pac-chat-xperts')).not.toBeNull()
    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.CommonWelcomeDescription')
  })

  it('starts a new assistant thread without leaving the common route', () => {
    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    fixture.componentInstance.newConv()

    expect(service.newConv).toHaveBeenCalled()
  })

  it('shows the change settings action to admins in the idle welcome content', () => {
    runtimeState.status.set('ready')
    user$.next({
      role: {
        name: RolesEnum.ADMIN
      }
    })

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    expect(fixture.componentInstance.canManageAssistantSettings()).toBe(true)
    expect(fixture.nativeElement.textContent).toContain('PAC.Assistant.ChangeSettings')
  })

  it('hides the change settings action from members in the idle welcome content', () => {
    runtimeState.status.set('ready')
    user$.next({
      role: {
        name: 'MEMBER'
      }
    })

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    expect(fixture.componentInstance.canManageAssistantSettings()).toBe(false)
    expect(fixture.nativeElement.textContent).not.toContain('PAC.Assistant.ChangeSettings')
  })

  it('hides the projected welcome content once a conversation is active', () => {
    runtimeState.status.set('ready')
    runtimeState.config.set({
      assistantId: 'assistant-1',
      sourceScope: 'tenant',
      enabled: true
    })

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()
    service.conversationId.set('conv-1')
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('pac-chat-xperts')).toBeNull()
    expect(fixture.nativeElement.textContent).not.toContain('PAC.Assistant.ChangeSettings')
    expect(fixture.nativeElement.querySelector('[data-testid="conversation-view"]')).not.toBeNull()
  })
})
