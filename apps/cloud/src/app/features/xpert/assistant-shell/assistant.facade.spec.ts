import { signal, type WritableSignal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { of, Subject } from 'rxjs'
import { type AssistantContext, type AssistantStudioRuntimeContext, XpertAssistantFacade } from './assistant.facade'

jest.mock('../../../@core', () => {
  return {
    AssistantCode: {
      CHAT_COMMON: 'chat_common',
      XPERT_SHARED: 'xpert_shared',
      CHATBI: 'chatbi'
    },
    AssistantBindingSourceScope: {
      NONE: 'none',
      TENANT: 'tenant',
      ORGANIZATION: 'organization'
    },
    XpertAPIService: class XpertAPIService {}
  }
})

jest.mock('@xpert-ai/cloud/state', () => ({
  injectWorkspace: () => () => ({ id: 'selected-workspace' })
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
    injectAssistantChatkitRuntime: jest.fn(() => runtimeState),
    __runtimeState: runtimeState
  }
})

type RuntimeStateMock = {
  control: WritableSignal<unknown>
  config: WritableSignal<unknown>
  loading: WritableSignal<boolean>
  status: WritableSignal<string>
  isConfigured: WritableSignal<boolean>
}

type RuntimeInputMock = {
  assistantCode: () => string | null
  displayMode?: string
  pet?: unknown
  requestContext?: () => Record<string, unknown> | null
  titleKey?: string
  titleDefault?: string
  onEffect?: (event: unknown) => void
  onLog?: (event: unknown) => void
  onResponseStart?: () => void
  onResponseEnd?: () => void
  onThreadChange?: (event: unknown) => void
  onThreadLoadStart?: (event: unknown) => void
  onThreadLoadEnd?: (event: unknown) => void
}

type RequestContextFacade = {
  buildRequestContext(
    context: AssistantContext,
    studioRuntimeContext?: AssistantStudioRuntimeContext | null
  ): Record<string, unknown>
}

const runtimeModule = jest.requireMock('../../assistant/assistant-chatkit.runtime') as {
  injectAssistantChatkitRuntime: jest.Mock
  __runtimeState: RuntimeStateMock
}
const runtimeState = runtimeModule.__runtimeState
const { AssistantBindingSourceScope, AssistantCode, XpertAPIService } = jest.requireMock('../../../@core') as {
  AssistantCode: {
    CHAT_COMMON: string
    XPERT_SHARED: string
    CHATBI: string
  }
  AssistantBindingSourceScope: {
    NONE: string
    TENANT: string
    ORGANIZATION: string
  }
  XpertAPIService: new () => unknown
}

function exposeRequestContext(facade: XpertAssistantFacade) {
  return facade as unknown as RequestContextFacade
}

function latestRuntimeInput() {
  return runtimeModule.injectAssistantChatkitRuntime.mock.calls.at(-1)?.[0] as RuntimeInputMock
}

describe('XpertAssistantFacade', () => {
  const createFacade = (url: string) => {
    const routerEvents$ = new Subject<unknown>()
    const router = {
      url,
      events: routerEvents$.asObservable(),
      navigate: jest.fn().mockResolvedValue(true)
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
    runtimeModule.injectAssistantChatkitRuntime.mockClear()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('configures the shared assistant runtime for ChatKit pet mode', () => {
    createFacade('/xpert/w/workspace-1')

    expect(latestRuntimeInput()).toEqual(
      expect.objectContaining({
        displayMode: 'pet',
        pet: {
          behavior: 'auto',
          position: {
            pin: 'bottom-right',
            draggable: true,
            persist: true,
            boundsPadding: 16,
            zIndex: 70
          }
        },
        titleKey: 'PAC.Xpert.Assistant',
        titleDefault: 'Assistant',
        onEffect: expect.any(Function)
      })
    )
    expect(latestRuntimeInput().assistantCode()).toBe(AssistantCode.XPERT_SHARED)
    expect(latestRuntimeInput().onLog).toBeUndefined()
    expect(latestRuntimeInput().onResponseStart).toBeUndefined()
    expect(latestRuntimeInput().onResponseEnd).toBeUndefined()
    expect(latestRuntimeInput().onThreadChange).toBeUndefined()
    expect(latestRuntimeInput().onThreadLoadStart).toBeUndefined()
    expect(latestRuntimeInput().onThreadLoadEnd).toBeUndefined()
  })

  it('omits env.xpertId on workspace routes', () => {
    const { facade } = createFacade('/xpert/w/workspace-1')

    const requestContext = exposeRequestContext(facade).buildRequestContext({
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

    const requestContext = exposeRequestContext(facade).buildRequestContext(
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
      assistantId: 'assistant-1',
      tenantId: 'tenant-1',
      organizationId: null,
      sourceScope: AssistantBindingSourceScope.TENANT
    })
    runtimeState.isConfigured.set(true)
    runtimeState.status.set('ready')

    expect(facade.assistantId()).toBe('assistant-1')
  })

  it('returns null assistant id when the runtime is not configured', () => {
    const { facade } = createFacade('/xpert/x/xpert-1/agents')

    expect(facade.assistantId()).toBeNull()
  })

  it('navigates to studio for studio navigation effects', () => {
    const { facade, router } = createFacade('/xpert/w/workspace-1')

    facade.handleEffect({
      name: 'navigate_to_studio',
      data: {
        xpertId: 'xpert-1'
      }
    })

    expect(router.navigate).toHaveBeenCalledWith(['/xpert/x', 'xpert-1', 'agents'])
  })

  it('emits studio refresh for refresh studio effects', () => {
    const { facade } = createFacade('/xpert/x/xpert-1/agents')

    facade.handleEffect({
      name: 'refresh_studio',
      data: {}
    })

    expect(facade.studioRefresh()).toEqual(
      expect.objectContaining({
        xpertId: 'xpert-1'
      })
    )
  })

  it('navigates to prompt workflows and emits refresh after authoring tool effects', async () => {
    const { facade, router } = createFacade('/xpert/w/workspace-1')

    facade.handleEffect({
      name: 'refresh_prompt_workflows',
      data: {
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
        key: 'review',
        operation: 'updated'
      }
    })

    expect(router.navigate).toHaveBeenCalledWith(['/xpert/w', 'workspace-1', 'prompt-workflows'])
    await router.navigate.mock.results[0].value
    await Promise.resolve()

    expect(facade.promptWorkflowRefresh()).toEqual(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
        key: 'review',
        operation: 'updated'
      })
    )
  })

  it('ignores prompt workflow effects without workspace id', () => {
    const { facade, router } = createFacade('/xpert/w/workspace-1')

    facade.handleEffect({
      name: 'refresh_prompt_workflows',
      data: {
        key: 'review'
      }
    })

    expect(router.navigate).not.toHaveBeenCalled()
    expect(facade.promptWorkflowRefresh()).toBeNull()
  })

  it('navigates to workspace skills and emits refresh after skill authoring effects', async () => {
    const { facade, router } = createFacade('/xpert/w/workspace-1')

    facade.handleEffect({
      name: 'refresh_workspace_skills',
      data: {
        workspaceId: 'workspace-1',
        skillId: 'skill-1',
        operation: 'created'
      }
    })

    expect(router.navigate).toHaveBeenCalledWith(['/xpert/w', 'workspace-1', 'skills'])
    await router.navigate.mock.results[0].value
    await Promise.resolve()

    expect(facade.workspaceSkillRefresh()).toEqual(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        skillId: 'skill-1',
        operation: 'created'
      })
    )
  })
})
