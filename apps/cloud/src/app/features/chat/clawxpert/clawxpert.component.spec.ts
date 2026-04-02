import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { ClawXpertComponent } from './clawxpert.component'

jest.mock('apps/cloud/src/app/@core', () => {
  const { of } = jest.requireActual('rxjs')

  class AssistantBindingService {
    get(): any {
      return of(null)
    }

    getPreference(): any {
      return of(null)
    }

    getAvailableXperts(): any {
      return of([])
    }

    upsert(): any {
      return of({
        code: 'clawxpert',
        assistantId: 'xpert-1',
        organizationId: 'org-1',
        userId: 'user-1'
      })
    }

    delete(): any {
      return of({})
    }

    upsertPreference(): any {
      return of({
        soul: '# Rules',
        profile: '# Profile'
      })
    }
  }

  class Store {
    organizationId = 'org-1'
    token = 'token'
    token$ = of('token')

    selectOrganizationId() {
      return of(this.organizationId)
    }
  }

  class ToastrService {
    success() {
      return undefined
    }

    error() {
      return undefined
    }
  }

  class XpertAPIService {
    getConversations(): any {
      return of({ items: [], total: 0 })
    }

    getDailyMessages(): any {
      return of([])
    }
  }

  class XpertTaskService {
    getMyAll(): any {
      return of({ items: [], total: 0 })
    }
  }

  return {
    AssistantCode: {
      CHAT_COMMON: 'chat_common',
      XPERT_SHARED: 'xpert_shared',
      CHATBI: 'chatbi',
      CLAWXPERT: 'clawxpert'
    },
    AssistantBindingScope: {
      USER: 'user'
    },
    AiFeatureEnum: {
      FEATURE_XPERT: 'FEATURE_XPERT',
      FEATURE_XPERT_CHATBI: 'FEATURE_XPERT_CHATBI',
      FEATURE_XPERT_CLAWXPERT: 'FEATURE_XPERT_CLAWXPERT'
    },
    AssistantBindingService,
    Store,
    ToastrService,
    XpertAPIService,
    XpertTaskService,
    OrderTypeEnum: {
      DESC: 'DESC'
    },
    getErrorMessage: (error: any) => error?.message ?? ''
  }
})

jest.mock('../../assistant/assistant-chatkit.runtime', () => {
  const { signal } = jest.requireActual('@angular/core')

  const runtimeState = {
    control: signal(null)
  }

  return {
    injectHostedAssistantChatkitControl: () => runtimeState.control,
    sanitizeAssistantFrameUrl: (frameUrl?: string | null) => frameUrl ?? null,
    __runtimeState: runtimeState
  }
})

const runtimeState = jest.requireMock('../../assistant/assistant-chatkit.runtime').__runtimeState as {
  control: ReturnType<typeof signal>
}

const { AssistantBindingScope, AssistantBindingService, Store, ToastrService, XpertAPIService, XpertTaskService } = jest.requireMock(
  'apps/cloud/src/app/@core'
) as {
  AssistantBindingScope: {
    USER: string
  }
  AssistantBindingService: new (...args: any[]) => unknown
  Store: new (...args: any[]) => unknown
  ToastrService: new (...args: any[]) => unknown
  XpertAPIService: new (...args: any[]) => unknown
  XpertTaskService: new (...args: any[]) => unknown
}

describe('ClawXpertComponent', () => {
  let assistantBindingService: {
    get: jest.Mock
    getPreference: jest.Mock
    getAvailableXperts: jest.Mock
    upsert: jest.Mock
    delete: jest.Mock
    upsertPreference: jest.Mock
  }
  let store: {
    organizationId: string | null
    token: string
    token$: any
    selectOrganizationId: jest.Mock
  }
  let toastr: {
    success: jest.Mock
    error: jest.Mock
  }
  let xpertService: {
    getConversations: jest.Mock
    getDailyMessages: jest.Mock
  }
  let taskService: {
    getMyAll: jest.Mock
  }

  beforeEach(() => {
    runtimeState.control.set(null)

    assistantBindingService = {
      get: jest.fn(() => of(null)),
      getPreference: jest.fn(() => of(null)),
      getAvailableXperts: jest.fn(() =>
        of([
          {
            id: 'xpert-1',
            name: 'Sales Guide',
            title: 'Sales Guide',
            latest: true
          }
        ])
      ),
      upsert: jest.fn(() =>
        of({
          code: 'clawxpert',
          assistantId: 'xpert-1',
          organizationId: 'org-1',
          userId: 'user-1'
        })
      ),
      delete: jest.fn(() => of({})),
      upsertPreference: jest.fn(() =>
        of({
          soul: '# Rules',
          profile: '# Profile'
        })
      )
    }
    store = {
      organizationId: 'org-1',
      token: 'token',
      token$: of('token'),
      selectOrganizationId: jest.fn(() => of('org-1'))
    }
    toastr = {
      success: jest.fn(),
      error: jest.fn()
    }
    xpertService = {
      getConversations: jest.fn(() => of({ items: [], total: 0 })),
      getDailyMessages: jest.fn(() => of([]))
    }
    taskService = {
      getMyAll: jest.fn(() => of({ items: [], total: 0 }))
    }

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertComponent],
      providers: [
        provideRouter([]),
        {
          provide: AssistantBindingService,
          useValue: assistantBindingService
        },
        {
          provide: Store,
          useValue: store
        },
        {
          provide: ToastrService,
          useValue: toastr
        },
        {
          provide: XpertAPIService,
          useValue: xpertService
        },
        {
          provide: XpertTaskService,
          useValue: taskService
        }
      ]
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('renders the organization required state when there is no active organization', async () => {
    store.organizationId = null
    store.selectOrganizationId.mockReturnValue(of(null))

    const fixture = TestBed.createComponent(ClawXpertComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.OrganizationRequired')
  })

  it('renders the setup wizard when no preference exists', async () => {
    const fixture = TestBed.createComponent(ClawXpertComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.WizardTitle')
  })

  it('accepts candidate xperts from paginated responses and still renders the wizard', async () => {
    assistantBindingService.getAvailableXperts.mockReturnValue(
      of({
        items: [
          {
            id: 'xpert-1',
            name: 'Sales Guide',
            title: 'Sales Guide',
            latest: true
          }
        ]
      })
    )

    const fixture = TestBed.createComponent(ClawXpertComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.WizardTitle')
    expect(fixture.nativeElement.textContent).not.toContain('PAC.Chat.ClawXpert.LoadFailed')
  })

  it('renders the embedded chatkit when the preference is configured', async () => {
    assistantBindingService.get.mockReturnValue(
      of({
        code: 'clawxpert',
        scope: AssistantBindingScope.USER,
        assistantId: 'xpert-1',
        organizationId: 'org-1',
        userId: 'user-1'
      })
    )
    runtimeState.control.set({
      subscribe: jest.fn(() => jest.fn()),
      setInstance: jest.fn(),
      getOptions: jest.fn(() => ({ frameUrl: '/chatkit' })),
      getHandlers: jest.fn(() => ({}))
    })

    const fixture = TestBed.createComponent(ClawXpertComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('xpert-chatkit')).not.toBeNull()
  })
})
