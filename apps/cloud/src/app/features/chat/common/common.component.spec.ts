import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ChatCommonAssistantComponent } from './common.component'
import { ChatHomeService } from '../home.service'

jest.mock('../../../@shared/avatar', () => {
  const angularCore = jest.requireActual('@angular/core')

  class EmojiAvatarComponent {}

  angularCore.Component({
    selector: 'emoji-avatar',
    standalone: true,
    template: '',
    inputs: ['avatar']
  })(EmojiAvatarComponent)

  return {
    EmojiAvatarComponent
  }
})

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

jest.mock('../home.service', () => ({
  ChatHomeService: class ChatHomeService {}
}))

const runtimeState = jest.requireMock('../../assistant/assistant-chatkit.runtime').__runtimeState as any

describe('ChatCommonAssistantComponent', () => {
  let router: Router
  let navigate: jest.SpyInstance

  beforeEach(() => {
    runtimeState.control.set(null)
    runtimeState.config.set(null)
    runtimeState.loading.set(false)
    runtimeState.status.set('missing')
    runtimeState.isConfigured.set(false)

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ChatCommonAssistantComponent],
      providers: [
        provideRouter([]),
        {
          provide: ChatHomeService,
          useValue: {
            sortedXperts: signal([
              {
                id: 'xpert-1',
                slug: 'sales-analyst',
                name: 'Sales Analyst',
                title: 'Sales Analyst',
                description: 'Sales assistant'
              }
            ])
          }
        }
      ]
    })

    router = TestBed.inject(Router)
    navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true)
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

  it('renders the embedded chatkit when ready', () => {
    runtimeState.status.set('ready')
    runtimeState.control.set({
      setThreadId: jest.fn(),
      subscribe: jest.fn(() => jest.fn()),
      setInstance: jest.fn(),
      getOptions: jest.fn(() => ({ frameUrl: 'https://frame.example.com' })),
      getHandlers: jest.fn(() => ({}))
    })

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('xpert-chatkit')).not.toBeNull()
  })

  it('starts a new assistant thread without leaving the common route', () => {
    const setThreadId = jest.fn().mockResolvedValue(undefined)
    runtimeState.status.set('ready')
    runtimeState.control.set({
      setThreadId,
      subscribe: jest.fn(() => jest.fn()),
      setInstance: jest.fn(),
      getOptions: jest.fn(() => ({ frameUrl: 'https://frame.example.com' })),
      getHandlers: jest.fn(() => ({}))
    })

    const fixture = TestBed.createComponent(ChatCommonAssistantComponent)
    fixture.detectChanges()

    fixture.componentInstance.newConv()

    expect(setThreadId).toHaveBeenCalledWith(null)
    expect(navigate).not.toHaveBeenCalled()
  })
})
