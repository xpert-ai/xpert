import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatCommonAssistantComponent } from './common.component'
import { ChatCommonService } from './common-chat.service'
import { ChatHomeService } from '../home.service'
import { clearChatCommonPendingInput, storeChatCommonPendingInput } from './pending-input.util'

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
    }
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

  class ChatService {}
  class XpertOcapService {}
  class XpertChatAppComponent {}

  angularCore.Component({
    selector: 'xpert-webapp',
    standalone: true,
    template: ''
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
    readonly assistantId = signal<string | null>(null)
    readonly xpert = signal(null)
    readonly ask = jest.fn()
    readonly newConv = jest.fn()
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

describe('ChatCommonAssistantComponent', () => {
  let router: Router
  let service: ChatCommonService & {
    ask: jest.Mock
    newConv: jest.Mock
    setAssistantId: jest.Mock
    assistantId: ReturnType<typeof import('@angular/core').signal<string | null>>
    xpert: ReturnType<typeof import('@angular/core').signal<unknown>>
  }

  beforeEach(() => {
    jest.useFakeTimers()

    runtimeState.config.set(null)
    runtimeState.hasSource.set(false)
    runtimeState.isConfigured.set(false)
    runtimeState.loading.set(false)
    runtimeState.status.set('missing')
    clearChatCommonPendingInput()

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
        }
      ]
    })

    router = TestBed.inject(Router)
    service = TestBed.inject(ChatCommonService) as typeof service
    jest.spyOn(router, 'getCurrentNavigation').mockReturnValue(null)
    Object.defineProperty(router, 'url', {
      configurable: true,
      get: () => '/chat/x/common'
    })
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    clearChatCommonPendingInput()
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('renders a missing-config empty state', () => {
    runtimeState.status.set('missing')

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('PAC.Assistant.MissingTitle')
  })

  it('renders the legacy xpert chat app when ready', () => {
    runtimeState.status.set('ready')
    runtimeState.config.set({
      assistantId: 'assistant-1',
      sourceScope: 'tenant',
      enabled: true
    })

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    expect(service.setAssistantId).toHaveBeenCalledWith('assistant-1')
    expect(fixture.nativeElement.querySelector('xpert-webapp')).not.toBeNull()
  })

  it('starts a new assistant thread without leaving the common route', () => {
    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    fixture.componentInstance.newConv()

    expect(service.newConv).toHaveBeenCalled()
  })

  it('reads a pending common conversation from router state input', () => {
    jest.spyOn(router, 'getCurrentNavigation').mockReturnValue({
      extras: {
        state: {
          input: 'Help me summarize this quarter'
        }
      }
    } as never)

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    expect(fixture.componentInstance.pendingConversation()?.text).toBe('Help me summarize this quarter')
  })

  it('reads a pending common conversation from storage when navigation state is unavailable', () => {
    storeChatCommonPendingInput('Draft the weekly recap')

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    expect(fixture.componentInstance.pendingConversation()?.text).toBe('Draft the weekly recap')
  })

  it('converts router-state input into the first legacy chat message', async () => {
    runtimeState.status.set('ready')
    runtimeState.config.set({
      assistantId: 'assistant-1',
      sourceScope: 'tenant',
      enabled: true
    })
    jest.spyOn(router, 'getCurrentNavigation').mockReturnValue({
      extras: {
        state: {
          input: 'Help me summarize this quarter'
        }
      }
    } as never)

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()
    await Promise.resolve()
    jest.runOnlyPendingTimers()

    expect(service.newConv).toHaveBeenCalled()
    expect(service.ask).toHaveBeenCalledWith('Help me summarize this quarter', { files: [] })
    expect(fixture.componentInstance.pendingConversation()).toBeNull()
  })

  it('converts stored input into the first legacy chat message', async () => {
    runtimeState.status.set('ready')
    runtimeState.config.set({
      assistantId: 'assistant-1',
      sourceScope: 'tenant',
      enabled: true
    })
    storeChatCommonPendingInput('Draft the weekly recap')

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()
    await Promise.resolve()
    jest.runOnlyPendingTimers()

    expect(service.ask).toHaveBeenCalledWith('Draft the weekly recap', { files: [] })
  })
})
