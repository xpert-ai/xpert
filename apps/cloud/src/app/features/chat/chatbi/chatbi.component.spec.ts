import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ChatBiComponent } from './chatbi.component'

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
    injectAssistantChatkitRuntime: () => runtimeState,
    __runtimeState: runtimeState
  }
})

const runtimeState = jest.requireMock('../../assistant/assistant-chatkit.runtime').__runtimeState as any

describe('ChatBiComponent', () => {
  beforeEach(() => {
    runtimeState.control.set(null)
    runtimeState.config.set(null)
    runtimeState.loading.set(false)
    runtimeState.status.set('missing')
    runtimeState.isConfigured.set(false)

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ChatBiComponent],
      providers: [provideRouter([])]
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('renders a missing-config empty state', () => {
    runtimeState.status.set('missing')

    const fixture = TestBed.createComponent(ChatBiComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('PAC.Assistant.MissingTitle')
  })

  it('renders a disabled state', () => {
    runtimeState.status.set('disabled')

    const fixture = TestBed.createComponent(ChatBiComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('PAC.Assistant.DisabledTitle')
  })

  it('renders the embedded chatkit when ready', () => {
    runtimeState.status.set('ready')
    runtimeState.control.set({
      subscribe: jest.fn(() => jest.fn()),
      setInstance: jest.fn(),
      getOptions: jest.fn(() => ({ frameUrl: 'https://frame.example.com' })),
      getHandlers: jest.fn(() => ({}))
    })

    const fixture = TestBed.createComponent(ChatBiComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('xpert-chatkit')).not.toBeNull()
  })
})
