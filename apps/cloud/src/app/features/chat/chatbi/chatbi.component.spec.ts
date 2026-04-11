import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { XpertAPIService } from '../../../@core'
import { ChatBiComponent } from './chatbi.component'
import { ChatBiTraceFacade } from './chatbi-trace.facade'

jest.mock('../../../xpert/ai-message/dashboard/dashboard.component', () => {
  const angularCore = jest.requireActual('@angular/core')

  class ChatMessageDashboardComponent {}

  angularCore.Component({
    selector: 'chat-message-dashboard',
    standalone: true,
    template: '',
    inputs: ['message', 'messageId', 'inline']
  })(ChatMessageDashboardComponent)

  return {
    ChatMessageDashboardComponent
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
    },
    XpertAPIService: class XpertAPIService {}
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
const xpertService = {
  getById: jest.fn<any, any>(() => of(null))
}
const traceFacade = {
  steps: signal([]),
  state: signal('idle'),
  error: signal(null),
  conversationStatus: signal('idle'),
  toggleDashboardPin: jest.fn(),
  handleLog: jest.fn(),
  handleResponseStart: jest.fn(),
  handleResponseEnd: jest.fn(),
  handleThreadChange: jest.fn(),
  handleThreadLoadStart: jest.fn(),
  handleThreadLoadEnd: jest.fn()
}

describe('ChatBiComponent', () => {
  beforeEach(() => {
    runtimeState.control.set(null)
    runtimeState.config.set(null)
    runtimeState.loading.set(false)
    runtimeState.status.set('missing')
    runtimeState.isConfigured.set(false)
    xpertService.getById.mockReset()
    xpertService.getById.mockReturnValue(of(null))
    traceFacade.steps.set([])
    traceFacade.state.set('idle')
    traceFacade.error.set(null)
    traceFacade.conversationStatus.set('idle')
    traceFacade.toggleDashboardPin.mockClear()
    traceFacade.handleLog.mockClear()
    traceFacade.handleResponseStart.mockClear()
    traceFacade.handleResponseEnd.mockClear()
    traceFacade.handleThreadChange.mockClear()
    traceFacade.handleThreadLoadStart.mockClear()
    traceFacade.handleThreadLoadEnd.mockClear()

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ChatBiComponent],
      providers: [provideRouter([]), { provide: XpertAPIService, useValue: xpertService }]
    })
    TestBed.overrideComponent(ChatBiComponent, {
      set: {
        providers: [
          {
            provide: ChatBiTraceFacade,
            useValue: traceFacade
          }
        ]
      }
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

  it('renders the bound xpert title and description in the header', async () => {
    runtimeState.config.set({
      assistantId: 'xpert-1'
    })
    xpertService.getById.mockReturnValue(
      of({
        id: 'xpert-1',
        name: 'ChatBI Assistant',
        title: 'Revenue Analyst',
        description: 'Tracks sales trends and explains changes.'
      })
    )

    const fixture = TestBed.createComponent(ChatBiComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('Revenue Analyst')
    expect(fixture.nativeElement.textContent).toContain('Tracks sales trends and explains changes.')
  })

  it('renders dashboard activity in the left panel when a dashboard item exists', () => {
    traceFacade.steps.set([
      {
        id: 'dashboard-1',
        pinned: false,
        type: 'component',
        data: {
          id: 'dashboard-1',
          category: 'Dashboard',
          type: 'AnalyticalCard',
          title: 'Sales Trend'
        }
      } as any
    ])

    const fixture = TestBed.createComponent(ChatBiComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('chat-message-dashboard')).not.toBeNull()
    expect(fixture.nativeElement.textContent).not.toContain('PAC.ChatBI.TraceEmpty')
  })

  it('forwards dashboard pin toggles to the trace facade', () => {
    traceFacade.steps.set([
      {
        id: 'dashboard-1',
        pinned: false,
        type: 'component',
        data: {
          id: 'dashboard-1',
          category: 'Dashboard',
          type: 'AnalyticalCard',
          title: 'Sales Trend'
        }
      } as any
    ])

    const fixture = TestBed.createComponent(ChatBiComponent)
    fixture.detectChanges()

    fixture.nativeElement.querySelector('[data-step-pin=\"dashboard-1\"]').click()

    expect(traceFacade.toggleDashboardPin).toHaveBeenCalledWith('dashboard-1')
  })
})
