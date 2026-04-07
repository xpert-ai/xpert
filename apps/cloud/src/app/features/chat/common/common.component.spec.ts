import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ChatCommonAssistantComponent } from './common.component'
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

jest.mock('../../assistant/assistant-chatkit.runtime', () => {
  const { signal } = jest.requireActual('@angular/core')

  const runtimeState = {
    control: signal(null),
    config: signal(null),
    loading: signal(false),
    status: signal('missing'),
    isConfigured: signal(false)
  }

  return {
    injectAssistantChatkitRuntime: jest.fn(() => runtimeState),
    __runtimeState: runtimeState
  }
})

const runtimeState = jest.requireMock('../../assistant/assistant-chatkit.runtime').__runtimeState as any
const {
  injectAssistantChatkitRuntime
}: {
  injectAssistantChatkitRuntime: jest.Mock
} = jest.requireMock('../../assistant/assistant-chatkit.runtime')

describe('ChatCommonAssistantComponent', () => {
  let router: Router

  beforeEach(() => {
    runtimeState.control.set(null)
    runtimeState.config.set(null)
    runtimeState.loading.set(false)
    runtimeState.status.set('missing')
    runtimeState.isConfigured.set(false)
    injectAssistantChatkitRuntime.mockClear()
    clearChatCommonPendingInput()

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ChatCommonAssistantComponent],
      providers: [provideRouter([])]
    })

    router = TestBed.inject(Router)
    jest.spyOn(router, 'getCurrentNavigation').mockReturnValue(null)
    Object.defineProperty(router, 'url', {
      configurable: true,
      get: () => '/chat/x/common'
    })
  })

  afterEach(() => {
    clearChatCommonPendingInput()
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('enables chatkit history in the runtime configuration', () => {
    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    expect(injectAssistantChatkitRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        history: {
          enabled: true,
          showDelete: false,
          showRename: false
        }
      })
    )
  })

  it('renders a missing-config empty state', () => {
    runtimeState.status.set('missing')

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('PAC.Assistant.MissingTitle')
  })

  it('renders the embedded chatkit when ready', () => {
    runtimeState.status.set('ready')
    runtimeState.config.set({
      assistantId: 'xpert-1',
      sourceScope: 'tenant',
      enabled: true
    })
    runtimeState.control.set({
      element: {},
      setThreadId: jest.fn(),
      sendUserMessage: jest.fn(),
      focusComposer: jest.fn(),
      subscribe: jest.fn(() => jest.fn()),
      setInstance: jest.fn(),
      getOptions: jest.fn(() => ({ frameUrl: 'https://frame.example.com' })),
      getHandlers: jest.fn(() => ({}))
    })

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('xpert-chatkit')).not.toBeNull()
  })

  it('starts a new assistant thread without leaving the common route', async () => {
    const setThreadId = jest.fn().mockResolvedValue(undefined)
    const focusComposer = jest.fn().mockResolvedValue(undefined)
    runtimeState.status.set('ready')
    runtimeState.config.set({
      assistantId: 'xpert-1',
      sourceScope: 'tenant',
      enabled: true
    })
    runtimeState.control.set({
      element: {},
      setThreadId,
      sendUserMessage: jest.fn(),
      focusComposer,
      subscribe: jest.fn(() => jest.fn()),
      setInstance: jest.fn(),
      getOptions: jest.fn(() => ({ frameUrl: 'https://frame.example.com' })),
      getHandlers: jest.fn(() => ({}))
    })

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    await fixture.componentInstance.newConv()

    expect(setThreadId).toHaveBeenCalledWith(null)
    expect(focusComposer).toHaveBeenCalled()
  })

  it('reads a pending common conversation from router state input', () => {
    runtimeState.status.set('ready')
    runtimeState.config.set({
      assistantId: 'xpert-1',
      sourceScope: 'tenant',
      enabled: true
    })
    runtimeState.control.set({
      element: {},
      setThreadId: jest.fn().mockResolvedValue(undefined),
      sendUserMessage: jest.fn().mockResolvedValue(undefined),
      focusComposer: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(() => jest.fn()),
      setInstance: jest.fn(),
      getOptions: jest.fn(() => ({ frameUrl: 'https://frame.example.com' })),
      getHandlers: jest.fn(() => ({}))
    })
    jest.spyOn(router, 'getCurrentNavigation').mockReturnValue({
      extras: {
        state: {
          input: 'Help me summarize this quarter'
        }
      }
    } as any)

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    expect(fixture.componentInstance.pendingConversation()?.text).toBe('Help me summarize this quarter')
  })

  it('reads a pending common conversation from storage when navigation state is unavailable', () => {
    runtimeState.status.set('ready')
    runtimeState.config.set({
      assistantId: 'xpert-1',
      sourceScope: 'tenant',
      enabled: true
    })
    runtimeState.control.set({
      element: {},
      setThreadId: jest.fn().mockResolvedValue(undefined),
      sendUserMessage: jest.fn().mockResolvedValue(undefined),
      focusComposer: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(() => jest.fn()),
      setInstance: jest.fn(),
      getOptions: jest.fn(() => ({ frameUrl: 'https://frame.example.com' })),
      getHandlers: jest.fn(() => ({}))
    })
    storeChatCommonPendingInput('Draft the weekly recap')

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    expect(fixture.componentInstance.pendingConversation()?.text).toBe('Draft the weekly recap')
  })
})
