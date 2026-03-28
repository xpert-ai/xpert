import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { AppService } from 'apps/cloud/src/app/app.service'
import { of, Subject } from 'rxjs'
import { XpertAssistantFacade } from './assistant.facade'

jest.mock('apps/cloud/src/app/@core', () => {
  return {
    AssistantCode: {
      XPERT_SHARED: 'xpert_shared',
      CHATBI: 'chatbi'
    },
    AssistantConfigSourceScope: {
      NONE: 'none',
      TENANT: 'tenant',
      ORGANIZATION: 'organization'
    },
    XpertAPIService: class XpertAPIService {}
  }
})

jest.mock('@metad/cloud/state', () => ({
  injectWorkspace: () => (() => ({ id: 'selected-workspace' }))
}))

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
const { AssistantCode, AssistantConfigSourceScope, XpertAPIService } = jest.requireMock(
  'apps/cloud/src/app/@core'
) as {
  AssistantCode: {
    XPERT_SHARED: string
    CHATBI: string
  }
  AssistantConfigSourceScope: {
    NONE: string
    TENANT: string
    ORGANIZATION: string
  }
  XpertAPIService: new (...args: any[]) => unknown
}

describe('XpertAssistantFacade', () => {
  const createFacade = (url: string) => {
    const routerEvents$ = new Subject<unknown>()
    const router = {
      url,
      events: routerEvents$.asObservable(),
      navigate: jest.fn()
    }

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        XpertAssistantFacade,
        {
          provide: Router,
          useValue: router
        },
        {
          provide: AppService,
          useValue: {
            isMobile: signal(false),
            lang: signal('en'),
            theme$: signal({ primary: 'light' })
          }
        },
        {
          provide: XpertAPIService,
          useValue: {
            getTeam: jest.fn().mockReturnValue(of({ workspaceId: 'workspace-from-team' }))
          }
        }
      ]
    })

    return {
      router,
      facade: TestBed.inject(XpertAssistantFacade)
    }
  }

  beforeEach(() => {
    runtimeState.control.set(null)
    runtimeState.config.set(null)
    runtimeState.loading.set(false)
    runtimeState.status.set('missing')
    runtimeState.isConfigured.set(false)
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('omits env.xpertId on workspace routes', () => {
    const { facade } = createFacade('/xpert/w/workspace-1')

    const requestContext = (facade as any).buildRequestContext({
      workspaceId: 'workspace-1',
      xpertId: null
    })

    expect(requestContext).toEqual({
      env: {
        workspaceId: 'workspace-1'
      }
    })
  })

  it('includes env.xpertId and studio runtime fields on studio routes', () => {
    const { facade } = createFacade('/xpert/x/xpert-1/agents')

    const requestContext = (facade as any).buildRequestContext(
      {
        workspaceId: 'workspace-1',
        xpertId: 'xpert-1'
      },
      {
        targetXpertId: 'xpert-1',
        baseDraftHash: 'hash-from-pristine',
        unsaved: true
      }
    )

    expect(requestContext).toEqual({
      env: {
        workspaceId: 'workspace-1',
        xpertId: 'xpert-1'
      },
      targetXpertId: 'xpert-1',
      baseDraftHash: 'hash-from-pristine',
      unsaved: true
    })
  })

  it('reads assistant id from the unified runtime config when configured', () => {
    const { facade } = createFacade('/xpert/x/xpert-1/agents')

    runtimeState.config.set({
      code: AssistantCode.XPERT_SHARED,
      enabled: true,
      options: {
        assistantId: 'assistant-1',
        frameUrl: 'https://frame.example.com'
      },
      tenantId: 'tenant-1',
      organizationId: null,
      sourceScope: AssistantConfigSourceScope.TENANT
    })
    runtimeState.isConfigured.set(true)
    runtimeState.status.set('ready')

    expect(facade.assistantId()).toBe('assistant-1')
  })

  it('returns null assistant id when the runtime is not configured', () => {
    const { facade } = createFacade('/xpert/x/xpert-1/agents')

    expect(facade.assistantId()).toBeNull()
  })
})
