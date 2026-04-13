jest.mock('../../../@core', () => ({
  AssistantBindingScope: {
    USER: 'user'
  },
  AssistantCode: {
    CLAWXPERT: 'clawxpert'
  },
  AssistantBindingService: class AssistantBindingService {},
  ChatConversationService: class ChatConversationService {},
  EnvironmentService: class EnvironmentService {},
  Store: class Store {},
  ToastrService: class ToastrService {},
  XpertAPIService: class XpertAPIService {},
  XpertTaskService: class XpertTaskService {},
  OrderTypeEnum: {
    DESC: 'DESC'
  },
  ScheduleTaskStatus: {
    SCHEDULED: 'scheduled'
  },
  WorkflowNodeTypeEnum: {
    TRIGGER: 'trigger'
  },
  XpertTypeEnum: {
    Agent: 'agent'
  },
  getErrorMessage: (error: any) => error?.message ?? ''
}))

jest.mock('../../assistant/assistant-chatkit.runtime', () => ({
  sanitizeAssistantFrameUrl: (url: string | null | undefined) => url ?? null
}))

jest.mock('../../assistant/assistant.registry', () => ({
  getAssistantRegistryItem: () => ({
    code: 'clawxpert',
    featureKeys: [],
    management: 'user',
    labelKey: 'PAC.Assistant.ClawXpert.Label',
    defaultLabel: 'ClawXpert',
    titleKey: 'PAC.Chat.ClawXpert.Title',
    defaultTitle: 'ClawXpert',
    descriptionKey: 'PAC.Assistant.ClawXpert.Description',
    defaultDescription: 'User-configured assistant used by the ClawXpert page.'
  })
}))

jest.mock('../../xpert/draft/index', () => {
  const triggerUtil = jest.requireActual('../../xpert/draft/xpert-draft-trigger.util')
  const providerOption = jest.requireActual('../../xpert/draft/workflow-trigger-provider-option')

  return {
    ...triggerUtil,
    ...providerOption,
    buildEditableXpertDraft: (xpert: { id?: string; draft?: any; graph?: { nodes?: any[]; connections?: any[] }; agent?: { key?: string } }) => ({
      team: {
        id: xpert?.draft?.team?.id ?? xpert?.id ?? null,
        ...(xpert?.draft?.team ?? {}),
        ...(xpert?.agent ? { agent: xpert.agent } : {})
      },
      nodes: xpert?.draft?.nodes ?? xpert?.graph?.nodes ?? [],
      connections: xpert?.draft?.connections ?? xpert?.graph?.connections ?? []
    })
  }
})

import { TestBed } from '@angular/core/testing'
import { NavigationEnd, Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { of, Subject, throwError } from 'rxjs'
import {
  AssistantBindingService,
  ChatConversationService,
  EnvironmentService,
  IAssistantBinding,
  IChatConversation,
  IXpert,
  Store,
  TXpertTeamDraft,
  ToastrService,
  WorkflowNodeTypeEnum,
  XpertAPIService,
  XpertTaskService,
  XpertTypeEnum
} from '../../../@core'
import { WorkflowTriggerProviderOption } from '../../xpert/draft/workflow-trigger-provider-option'
import { ClawXpertFacade, ClawXpertTriggerEditorItem } from './clawxpert.facade'

async function flushPromises() {
  for (let index = 0; index < 3; index++) {
    await Promise.resolve()
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function createXpert(id: string, name = id, overrides?: Partial<IXpert>): IXpert {
  return {
    id,
    name,
    latest: true,
    type: XpertTypeEnum.Agent,
    ...overrides
  } as IXpert
}

function createBinding(assistantId: string): IAssistantBinding {
  return {
    id: `${assistantId}-binding`,
    code: 'clawxpert',
    assistantId,
    organizationId: 'org-1',
    userId: 'user-1'
  } as IAssistantBinding
}

function createDraft(id: string, overrides?: Partial<TXpertTeamDraft>): TXpertTeamDraft {
  return {
    team: {
      id
    } as TXpertTeamDraft['team'],
    nodes: [],
    connections: [],
    ...overrides
  }
}

function createTeam(id: string, name = id, overrides?: Partial<IXpert>): IXpert {
  return {
    ...createXpert(id, name, overrides),
    draft: createDraft(id)
  } as IXpert
}

function createConversation(id: string, overrides?: Partial<IChatConversation>): IChatConversation {
  return {
    id,
    threadId: `${id}-thread`,
    from: 'platform',
    status: 'idle',
    ...overrides
  } as IChatConversation
}

function createConversationPreferences(overrides?: { defaultThreadId?: string | null; lastThreadId?: string | null }) {
  return {
    version: 1 as const,
    ...(Object.prototype.hasOwnProperty.call(overrides ?? {}, 'defaultThreadId')
      ? { defaultThreadId: overrides?.defaultThreadId ?? null }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(overrides ?? {}, 'lastThreadId')
      ? { lastThreadId: overrides?.lastThreadId ?? null }
      : {})
  }
}

function createToolPreferences() {
  return {
    version: 1 as const,
    toolsets: {
      'toolset-node': {
        toolsetId: 'toolset-1',
        toolsetName: 'Search',
        disabledTools: ['tavily_search']
      }
    }
  }
}

function createAgentNode(key = 'agent-1') {
  return {
    key,
    type: 'agent',
    position: { x: 320, y: 160 },
    entity: {
      id: key,
      key
    }
  } as TXpertTeamDraft['nodes'][number]
}

function createTriggerNode(key = 'trigger-existing', provider = 'scheduler', config?: Record<string, unknown>) {
  return {
    key,
    type: 'workflow',
    position: { x: 40, y: 160 },
    entity: {
      id: key,
      key,
      type: WorkflowNodeTypeEnum.TRIGGER,
      title: provider,
      from: provider,
      config
    }
  } as TXpertTeamDraft['nodes'][number]
}

function createTriggerItem(
  nodeKey = 'trigger-new',
  provider = 'webhook',
  config?: Record<string, unknown>
): ClawXpertTriggerEditorItem {
  return {
    nodeKey,
    provider: {
      name: provider,
      label: {
        en_US: provider,
        zh_Hans: provider
      }
    } as WorkflowTriggerProviderOption,
    config
  }
}

function createSkillPreferences() {
  return {
    version: 1 as const,
    skills: {
      'workspace-1': {
        workspaceId: 'workspace-1',
        disabledSkillIds: ['skill-1']
      }
    }
  }
}

function createToolAndSkillPreferences() {
  return {
    ...createToolPreferences(),
    skills: createSkillPreferences().skills
  }
}

describe('ClawXpertFacade', () => {
  let assistantBindingService: {
    delete: jest.Mock
    get: jest.Mock
    getAvailableXperts: jest.Mock
    getPreference: jest.Mock
    upsert: jest.Mock
    upsertPreference: jest.Mock
  }
  let store: {
    organizationId: string | null
    selectOrganizationId: jest.Mock
  }
  let toastr: {
    error: jest.Mock
    success: jest.Mock
  }
  let translate: {
    instant: jest.Mock
  }
  let xpertService: {
    getConversations: jest.Mock
    getDailyMessages: jest.Mock
    publish: jest.Mock
    getTeam: jest.Mock
    getTriggerProviders: jest.Mock
    saveDraft: jest.Mock
  }
  let conversationService: {
    findAllByXpert: jest.Mock
    getByThreadId: jest.Mock
  }
  let environmentService: {
    getDefaultByWorkspace: jest.Mock
  }
  let taskService: {
    getMyAll: jest.Mock
  }
  let router: {
    url: string
    events: Subject<NavigationEnd>
    navigate: jest.Mock
  }

  beforeEach(() => {
    assistantBindingService = {
      delete: jest.fn(() => of({})),
      get: jest.fn(() => of(null)),
      getAvailableXperts: jest.fn(() => of([])),
      getPreference: jest.fn(() => of(null)),
      upsert: jest.fn(() => of(createBinding('xpert-1'))),
      upsertPreference: jest.fn(() => of(null))
    }
    store = {
      organizationId: 'org-1',
      selectOrganizationId: jest.fn(() => of('org-1'))
    }
    toastr = {
      error: jest.fn(),
      success: jest.fn()
    }
    translate = {
      instant: jest.fn((key: string, params?: { Default?: string }) => params?.Default ?? key)
    }
    xpertService = {
      getConversations: jest.fn(() => of({ items: [], total: 0 })),
      getDailyMessages: jest.fn(() => of([])),
      publish: jest.fn(() => of(createXpert('xpert-1'))),
      getTeam: jest.fn((id: string) => of(createTeam(id))),
      getTriggerProviders: jest.fn(() => of([])),
      saveDraft: jest.fn((id: string, draft: TXpertTeamDraft) => of({ ...draft, team: { ...draft.team, id } }))
    }
    conversationService = {
      findAllByXpert: jest.fn(() => of({ items: [], total: 0 })),
      getByThreadId: jest.fn(() => of(null))
    }
    environmentService = {
      getDefaultByWorkspace: jest.fn(() => of(null))
    }
    taskService = {
      getMyAll: jest.fn(() => of({ items: [], total: 0 }))
    }
    router = {
      url: '/chat/clawxpert',
      events: new Subject<NavigationEnd>(),
      navigate: jest.fn(() => Promise.resolve(true))
    }

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        ClawXpertFacade,
        {
          provide: AssistantBindingService,
          useValue: assistantBindingService
        },
        {
          provide: Router,
          useValue: router
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
          provide: TranslateService,
          useValue: translate
        },
        {
          provide: EnvironmentService,
          useValue: environmentService
        },
        {
          provide: XpertAPIService,
          useValue: xpertService
        },
        {
          provide: ChatConversationService,
          useValue: conversationService
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

  it('merges a newly published xpert and resolves the binding immediately', async () => {
    assistantBindingService.upsert.mockReturnValue(of(createBinding('xpert-new')))

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    const publishedXpert = createXpert('xpert-new', 'New ClawXpert')
    await facade.bindPublishedXpert(publishedXpert)
    await flushPromises()

    expect(facade.availableXperts().some((xpert) => xpert.id === 'xpert-new')).toBe(true)
    expect(facade.resolvedPreference()?.assistantId).toBe('xpert-new')
    expect(facade.viewState()).toBe('ready')
    expect(toastr.success).toHaveBeenCalled()
  })

  it('rebinds to the newly published xpert even when an older binding already exists', async () => {
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-old')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-old', 'Existing ClawXpert')]))
    assistantBindingService.upsert.mockReturnValue(of(createBinding('xpert-old')))

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    expect(facade.preference()?.assistantId).toBe('xpert-old')
    expect(facade.resolvedPreference()?.assistantId).toBe('xpert-old')

    const publishedXpert = createXpert('xpert-new', 'New ClawXpert')
    await facade.bindPublishedXpert(publishedXpert)
    await flushPromises()

    expect(assistantBindingService.upsert).toHaveBeenCalledWith({
      assistantId: 'xpert-new',
      code: 'clawxpert',
      scope: 'user'
    })
    expect(facade.availableXperts().map((xpert) => xpert.id)).toContain('xpert-new')
    expect(facade.preference()?.assistantId).toBe('xpert-new')
    expect(facade.resolvedPreference()?.assistantId).toBe('xpert-new')
    expect(facade.currentXpert()?.id).toBe('xpert-new')
    expect(facade.viewState()).toBe('ready')
  })

  it('keeps the current binding when persisting a new published xpert fails', async () => {
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-old')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-old', 'Existing ClawXpert')]))
    assistantBindingService.upsert.mockReturnValue(throwError(() => new Error('bind failed')))

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    expect(facade.resolvedPreference()?.assistantId).toBe('xpert-old')

    await facade.bindPublishedXpert(createXpert('xpert-new', 'New ClawXpert'))
    await flushPromises()

    expect(facade.preference()?.assistantId).toBe('xpert-old')
    expect(facade.resolvedPreference()?.assistantId).toBe('xpert-old')
    expect(toastr.error).toHaveBeenCalled()
  })

  it('loads the bound xpert draft for trigger editing once the binding is ready', async () => {
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-ready')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-ready', 'Ready Xpert')]))

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    expect(xpertService.getTeam).toHaveBeenCalledWith('xpert-ready', {
      relations: [
        'agent',
        'agent.copilotModel',
        'agents',
        'agents.copilotModel',
        'executors',
        'executors.agent',
        'executors.copilotModel',
        'copilotModel',
        'knowledgebase'
      ]
    })
    expect(facade.triggerDraft()?.team?.id).toBe('xpert-ready')
    expect(facade.loadingTriggerDraft()).toBe(false)
  })

  it('saves trigger draft updates against the bound xpert draft', async () => {
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-save')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-save', 'Draft Xpert')]))

    const savedDraft = createDraft('xpert-save')
    xpertService.saveDraft.mockReturnValue(of(savedDraft))

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    const result = await facade.saveTriggerDraft([])

    expect(xpertService.saveDraft).toHaveBeenCalledWith(
      'xpert-save',
      expect.objectContaining({ team: expect.objectContaining({ id: 'xpert-save' }) })
    )
    expect(result).toEqual(savedDraft)
    expect(facade.triggerDraft()).toEqual(savedDraft)
    expect(toastr.success).toHaveBeenCalled()
  })

  it('appends new trigger nodes and edge connections when saving trigger draft updates', async () => {
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-save')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-save', 'Draft Xpert')]))

    const initialDraft = createDraft('xpert-save', {
      team: {
        id: 'xpert-save',
        agent: {
          key: 'agent-1'
        }
      } as TXpertTeamDraft['team'],
      nodes: [createAgentNode('agent-1'), createTriggerNode('trigger-existing', 'scheduler', { cron: '0 0 * * *' })],
      connections: [
        {
          type: 'edge',
          key: 'trigger-existing/agent-1',
          from: 'trigger-existing',
          to: 'agent-1'
        }
      ]
    })
    xpertService.getTeam.mockReturnValue(
      of({
        ...createTeam('xpert-save', 'Draft Xpert'),
        agent: {
          key: 'agent-1'
        },
        draft: initialDraft
      })
    )
    xpertService.saveDraft.mockImplementation((_id: string, draft: TXpertTeamDraft) => of(draft))

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    const result = await facade.saveTriggerDraft([
      createTriggerItem('trigger-existing', 'scheduler', { cron: '0 15 * * *' }),
      createTriggerItem('trigger-new', 'webhook', { url: 'https://example.com/hook' })
    ])

    const savedDraft = xpertService.saveDraft.mock.calls.at(-1)?.[1] as TXpertTeamDraft
    const existingTrigger = savedDraft.nodes.find((node) => node.key === 'trigger-existing')
    const newTrigger = savedDraft.nodes.find((node) => node.key === 'trigger-new')

    expect(existingTrigger?.entity).toEqual(
      expect.objectContaining({
        config: { cron: '0 15 * * *' }
      })
    )
    expect(newTrigger?.entity).toEqual(
      expect.objectContaining({
        type: WorkflowNodeTypeEnum.TRIGGER,
        from: 'webhook',
        title: 'webhook',
        config: { url: 'https://example.com/hook' }
      })
    )
    expect(newTrigger?.position).toEqual({ x: 40, y: 280 })
    expect(savedDraft.connections).toContainEqual({
      type: 'edge',
      key: 'trigger-new/agent-1',
      from: 'trigger-new',
      to: 'agent-1'
    })
    expect(result).toEqual(savedDraft)
  })

  it('refuses to save a new trigger when the primary agent node cannot be resolved', async () => {
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-save')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-save', 'Draft Xpert')]))

    xpertService.getTeam.mockReturnValue(
      of({
        ...createTeam('xpert-save', 'Draft Xpert'),
        agent: {
          key: 'agent-missing'
        },
        draft: createDraft('xpert-save', {
          team: {
            id: 'xpert-save',
            agent: {
              key: 'agent-missing'
            }
          } as TXpertTeamDraft['team'],
          nodes: [],
          connections: []
        })
      })
    )

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    const result = await facade.saveTriggerDraft([
      createTriggerItem('trigger-new', 'webhook', { url: 'https://example.com/hook' })
    ])

    expect(result).toBeNull()
    expect(xpertService.saveDraft).not.toHaveBeenCalled()
    expect(toastr.error).toHaveBeenCalledWith(
      'Unable to save the trigger draft because the primary agent node could not be resolved.'
    )
  })

  it('publishes the bound xpert when a persisted draft exists', async () => {
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-publish')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-publish', 'Publish Xpert')]))
    xpertService.getTeam.mockReturnValue(
      of({
        ...createTeam('xpert-publish', 'Publish Xpert'),
        workspaceId: 'workspace-1'
      })
    )
    xpertService.publish.mockReturnValue(of({ ...createXpert('xpert-publish', 'Publish Xpert'), version: '1.0.0' }))

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    const result = await facade.publishXpert()

    expect(environmentService.getDefaultByWorkspace).toHaveBeenCalledWith('workspace-1')
    expect(xpertService.publish).toHaveBeenCalledWith('xpert-publish', false, {
      environmentId: null,
      releaseNotes: 'Published from ClawXpert workspace.'
    })
    expect(result).toEqual(expect.objectContaining({ id: 'xpert-publish', version: '1.0.0' }))
    expect(facade.hasPersistedDraft()).toBe(false)
    expect(toastr.success).toHaveBeenCalled()
  })

  it('loads saved tool preferences with the user preference payload', async () => {
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-tools')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-tools', 'Tool Xpert')]))
    assistantBindingService.getPreference.mockReturnValue(
      of({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: createToolPreferences()
      })
    )

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    expect(facade.toolPreferences()).toEqual(createToolPreferences())
    expect(facade.isToolEnabled('toolset', 'toolset-node', 'tavily_search')).toBe(false)
  })

  it('prefers the loaded draft workspace and normalizes saved skill preferences', async () => {
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-tools')))
    assistantBindingService.getAvailableXperts.mockReturnValue(
      of([createXpert('xpert-tools', 'Tool Xpert', { workspaceId: 'workspace-public' })])
    )
    assistantBindingService.getPreference.mockReturnValue(
      of({
        toolPreferences: {
          version: 1,
          skills: {
            'workspace-draft': {
              workspaceId: 'workspace-draft',
              disabledSkillIds: ['skill-1', 'skill-1', ' ']
            },
            ' ': {
              workspaceId: ' ',
              disabledSkillIds: ['should-be-dropped']
            }
          }
        }
      })
    )
    xpertService.getTeam.mockReturnValue(
      of(createTeam('xpert-tools', 'Tool Xpert', { workspaceId: 'workspace-draft' }))
    )

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    expect(facade.currentWorkspaceId()).toBe('workspace-draft')
    expect(facade.toolPreferences()).toEqual({
      version: 1,
      skills: {
        'workspace-draft': {
          workspaceId: 'workspace-draft',
          disabledSkillIds: ['skill-1']
        }
      }
    })
    expect(facade.isSkillEnabled('workspace-draft', 'skill-1')).toBe(false)
    expect(facade.isSkillEnabled('workspace-draft', 'skill-2')).toBe(true)
  })

  it('loads user preferences even when the binding payload does not include an id', async () => {
    assistantBindingService.get.mockReturnValue(
      of({
        code: 'clawxpert',
        assistantId: 'xpert-tools',
        organizationId: 'org-1',
        userId: 'user-1'
      } as IAssistantBinding)
    )
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-tools', 'Tool Xpert')]))
    assistantBindingService.getPreference.mockReturnValue(
      of({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: createToolPreferences()
      })
    )

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    expect(assistantBindingService.getPreference).toHaveBeenCalledWith('clawxpert', 'user')
    expect(facade.isToolEnabled('toolset', 'toolset-node', 'tavily_search')).toBe(false)
  })

  it('saves tool preference updates without clearing markdown fields', async () => {
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-tools')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-tools', 'Tool Xpert')]))
    assistantBindingService.getPreference.mockReturnValue(
      of({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: {
          version: 1
        }
      })
    )
    assistantBindingService.upsertPreference.mockReturnValue(
      of({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: createToolPreferences()
      })
    )

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    const result = await facade.setToolEnabled(
      'toolset',
      'toolset-node',
      {
        toolsetId: 'toolset-1',
        toolsetName: 'Search'
      },
      'tavily_search',
      false
    )

    expect(result).toBe(true)
    expect(assistantBindingService.upsertPreference).toHaveBeenCalledWith('clawxpert', {
      scope: 'user',
      toolPreferences: createToolPreferences()
    })
    expect(facade.userPreference()).toEqual(
      expect.objectContaining({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: createToolPreferences()
      })
    )
  })

  it('keeps the optimistic tool preference when the save response omits toolPreferences', async () => {
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-tools')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-tools', 'Tool Xpert')]))
    assistantBindingService.getPreference.mockReturnValue(
      of({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: {
          version: 1
        }
      })
    )
    assistantBindingService.upsertPreference.mockReturnValue(
      of({
        soul: '# Rules',
        profile: '# Profile'
      })
    )

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    const result = await facade.setToolEnabled(
      'toolset',
      'toolset-node',
      {
        toolsetId: 'toolset-1',
        toolsetName: 'Search'
      },
      'tavily_search',
      false
    )

    expect(result).toBe(true)
    expect(facade.isToolEnabled('toolset', 'toolset-node', 'tavily_search')).toBe(false)
    expect(facade.userPreference()?.toolPreferences).toEqual(createToolPreferences())
  })

  it('saves skill preference updates without clearing markdown fields or existing tool preferences', async () => {
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-tools')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-tools', 'Tool Xpert')]))
    assistantBindingService.getPreference.mockReturnValue(
      of({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: createToolPreferences()
      })
    )
    assistantBindingService.upsertPreference.mockReturnValue(
      of({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: createToolAndSkillPreferences()
      })
    )

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    const result = await facade.setSkillEnabled('workspace-1', 'skill-1', false)

    expect(result).toBe(true)
    expect(assistantBindingService.upsertPreference).toHaveBeenCalledWith('clawxpert', {
      scope: 'user',
      toolPreferences: createToolAndSkillPreferences()
    })
    expect(facade.userPreference()).toEqual(
      expect.objectContaining({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: createToolAndSkillPreferences()
      })
    )
    expect(facade.isSkillEnabled('workspace-1', 'skill-1')).toBe(false)
  })

  it('keeps the optimistic skill preference when the save response omits the skills field', async () => {
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-tools')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-tools', 'Tool Xpert')]))
    assistantBindingService.getPreference.mockReturnValue(
      of({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: createToolPreferences()
      })
    )
    assistantBindingService.upsertPreference.mockReturnValue(
      of({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: createToolPreferences()
      })
    )

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    const result = await facade.setSkillEnabled('workspace-1', 'skill-1', false)

    expect(result).toBe(true)
    expect(facade.userPreference()?.toolPreferences).toEqual(createToolAndSkillPreferences())
    expect(facade.isSkillEnabled('workspace-1', 'skill-1')).toBe(false)
  })

  it('ignores stale in-flight preference loads after a tool preference save', async () => {
    const preferenceLoad$ = new Subject<any>()

    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-tools')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-tools', 'Tool Xpert')]))
    assistantBindingService.getPreference.mockReturnValue(preferenceLoad$.asObservable())
    assistantBindingService.upsertPreference.mockReturnValue(
      of({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: createToolPreferences()
      })
    )

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    const savePromise = facade.setToolEnabled(
      'toolset',
      'toolset-node',
      {
        toolsetId: 'toolset-1',
        toolsetName: 'Search'
      },
      'tavily_search',
      false
    )

    await expect(savePromise).resolves.toBe(true)
    expect(facade.isToolEnabled('toolset', 'toolset-node', 'tavily_search')).toBe(false)

    preferenceLoad$.next({
      soul: '# Rules',
      profile: '# Profile',
      toolPreferences: {
        version: 1
      }
    })
    preferenceLoad$.complete()
    await flushPromises()

    expect(facade.isToolEnabled('toolset', 'toolset-node', 'tavily_search')).toBe(false)
    expect(facade.userPreference()?.toolPreferences).toEqual(createToolPreferences())
  })

  it('saves tool preferences even when the loaded binding payload omits id', async () => {
    assistantBindingService.get.mockReturnValue(
      of({
        code: 'clawxpert',
        assistantId: 'xpert-tools',
        organizationId: 'org-1',
        userId: 'user-1'
      } as IAssistantBinding)
    )
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-tools', 'Tool Xpert')]))
    assistantBindingService.getPreference.mockReturnValue(
      of({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: {
          version: 1
        }
      })
    )
    assistantBindingService.upsertPreference.mockReturnValue(
      of({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: createToolPreferences()
      })
    )

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    await expect(
      facade.setToolEnabled(
        'toolset',
        'toolset-node',
        {
          toolsetId: 'toolset-1',
          toolsetName: 'Search'
        },
        'tavily_search',
        false
      )
    ).resolves.toBe(true)

    expect(assistantBindingService.upsertPreference).toHaveBeenCalledWith('clawxpert', {
      scope: 'user',
      toolPreferences: createToolPreferences()
    })
    expect(facade.isToolEnabled('toolset', 'toolset-node', 'tavily_search')).toBe(false)
  })

  it('keeps existing tool preferences after saving markdown documents', async () => {
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-docs')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-docs', 'Docs Xpert')]))
    assistantBindingService.getPreference.mockReturnValue(
      of({
        soul: '# Rules',
        profile: '# Profile',
        toolPreferences: createToolPreferences()
      })
    )
    assistantBindingService.upsertPreference.mockReturnValue(
      of({
        soul: '# Updated Rules',
        profile: '# Updated Profile',
        toolPreferences: createToolPreferences()
      })
    )

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    const result = await facade.saveUserPreference({
      soul: '# Updated Rules',
      profile: '# Updated Profile'
    })

    expect(result).toEqual(
      expect.objectContaining({
        soul: '# Updated Rules',
        profile: '# Updated Profile',
        toolPreferences: createToolPreferences()
      })
    )
    expect(facade.userPreference()?.toolPreferences).toEqual(createToolPreferences())
  })

  it('loads conversation preferences with the user preference payload', async () => {
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-threads')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-threads', 'Thread Xpert')]))
    assistantBindingService.getPreference.mockReturnValue(
      of({
        conversationPreferences: createConversationPreferences({
          defaultThreadId: 'thread-main',
          lastThreadId: 'thread-last'
        })
      })
    )

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    expect(facade.defaultThreadId()).toBe('thread-main')
    expect(facade.lastThreadId()).toBe('thread-last')
  })

  it('restores the saved main conversation before any fallback', async () => {
    router.url = '/chat/clawxpert/c'
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-threads')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-threads', 'Thread Xpert')]))
    assistantBindingService.getPreference.mockReturnValue(
      of({
        conversationPreferences: createConversationPreferences({
          defaultThreadId: 'thread-main',
          lastThreadId: 'thread-last'
        })
      })
    )
    conversationService.getByThreadId.mockReturnValue(
      of(createConversation('conversation-main', { threadId: 'thread-main', xpertId: 'xpert-threads' }))
    )

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    await facade.ensureConversationEntry({
      focusComposer: jest.fn()
    } as any)

    expect(conversationService.getByThreadId).toHaveBeenCalledWith('thread-main')
    expect(conversationService.findAllByXpert).not.toHaveBeenCalled()
    expect(router.navigate).toHaveBeenCalledWith(['/chat/clawxpert', 'c', 'thread-main'])
  })

  it('clears an invalid main conversation and falls back to the last thread', async () => {
    router.url = '/chat/clawxpert/c'
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-threads')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-threads', 'Thread Xpert')]))
    assistantBindingService.getPreference.mockReturnValue(
      of({
        conversationPreferences: createConversationPreferences({
          defaultThreadId: 'thread-main',
          lastThreadId: 'thread-last'
        })
      })
    )
    assistantBindingService.upsertPreference.mockReturnValue(
      of({
        conversationPreferences: createConversationPreferences({
          lastThreadId: 'thread-last'
        })
      })
    )
    conversationService.getByThreadId
      .mockReturnValueOnce(of(null))
      .mockReturnValueOnce(of(createConversation('conversation-last', { threadId: 'thread-last', xpertId: 'xpert-threads' })))

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    await facade.ensureConversationEntry({
      focusComposer: jest.fn()
    } as any)

    expect(assistantBindingService.upsertPreference).toHaveBeenCalledWith('clawxpert', {
      scope: 'user',
      conversationPreferences: createConversationPreferences({
        defaultThreadId: null,
        lastThreadId: 'thread-last'
      })
    })
    expect(router.navigate).toHaveBeenCalledWith(['/chat/clawxpert', 'c', 'thread-last'])
  })

  it('falls back to the latest updated conversation when no saved thread exists', async () => {
    router.url = '/chat/clawxpert/c'
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-threads')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-threads', 'Thread Xpert')]))
    conversationService.findAllByXpert.mockReturnValue(
      of({
        items: [createConversation('conversation-latest', { threadId: 'thread-latest', xpertId: 'xpert-threads' })],
        total: 1
      })
    )
    conversationService.getByThreadId.mockReturnValue(
      of(createConversation('conversation-latest', { threadId: 'thread-latest', xpertId: 'xpert-threads' }))
    )

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    await facade.ensureConversationEntry({
      focusComposer: jest.fn()
    } as any)

    expect(conversationService.findAllByXpert).toHaveBeenCalledWith('xpert-threads', {
      take: 1,
      order: {
        updatedAt: 'DESC'
      }
    })
    expect(router.navigate).toHaveBeenCalledWith(['/chat/clawxpert', 'c', 'thread-latest'])
  })

  it('suppresses auto resume for explicit new conversations and focuses the composer instead', async () => {
    router.url = '/chat/clawxpert/c'
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-threads')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-threads', 'Thread Xpert')]))

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    await facade.startConversation()

    const focusComposer = jest.fn()
    await facade.ensureConversationEntry({
      focusComposer
    } as any)

    expect(focusComposer).toHaveBeenCalled()
    expect(conversationService.getByThreadId).not.toHaveBeenCalled()
    expect(conversationService.findAllByXpert).not.toHaveBeenCalled()
  })

  it('suppresses auto resume when chatkit resets an active thread to start a new conversation', async () => {
    router.url = '/chat/clawxpert/c/thread-active'
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-threads')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-threads', 'Thread Xpert')]))
    assistantBindingService.getPreference.mockReturnValue(
      of({
        conversationPreferences: createConversationPreferences({
          defaultThreadId: 'thread-main',
          lastThreadId: 'thread-last'
        })
      })
    )

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    facade.onChatThreadChange(null)
    await flushPromises()

    expect(facade.suppressAutoResume()).toBe(true)
    expect(router.navigate).toHaveBeenCalledWith(['/chat/clawxpert', 'c'])

    router.navigate.mockClear()
    router.url = '/chat/clawxpert/c'
    router.events.next(new NavigationEnd(1, router.url, router.url))
    await flushPromises()

    const focusComposer = jest.fn()
    await facade.ensureConversationEntry({
      focusComposer
    } as any)

    expect(focusComposer).toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
    expect(conversationService.getByThreadId).not.toHaveBeenCalled()
    expect(conversationService.findAllByXpert).not.toHaveBeenCalled()
  })

  it('navigates to the new chatkit thread after a blank conversation is created', async () => {
    router.url = '/chat/clawxpert/c/thread-active'
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-threads')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-threads', 'Thread Xpert')]))

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    facade.onChatThreadChange(null)
    await flushPromises()

    router.navigate.mockClear()

    facade.onChatThreadChange('thread-new')
    await flushPromises()

    expect(facade.suppressAutoResume()).toBe(false)
    expect(router.navigate).toHaveBeenCalledWith(['/chat/clawxpert', 'c', 'thread-new'])
  })

  it('clears saved conversation pointers when rebinding to a different ClawXpert', async () => {
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-old')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-old', 'Old Xpert')]))
    assistantBindingService.getPreference.mockReturnValue(
      of({
        conversationPreferences: createConversationPreferences({
          defaultThreadId: 'thread-old',
          lastThreadId: 'thread-old'
        })
      })
    )
    assistantBindingService.upsert.mockReturnValue(of(createBinding('xpert-new')))
    assistantBindingService.upsertPreference.mockReturnValue(
      of({
        conversationPreferences: null
      })
    )

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    await facade.savePreference('xpert-new')

    expect(assistantBindingService.upsertPreference).toHaveBeenCalledWith('clawxpert', {
      scope: 'user',
      conversationPreferences: null
    })
    expect(facade.conversationPreferences()).toBeNull()
  })

  it('prefers title before name when resolving the current xpert label', async () => {
    const facade = TestBed.inject(ClawXpertFacade)

    expect(facade.getXpertLabel({ title: 'Display', name: 'Internal', slug: 'slug' } as IXpert)).toBe('Display')
    expect(facade.getXpertLabel({ name: 'Internal', slug: 'slug' } as IXpert)).toBe('Internal')
  })

  it('derives the sidebar status from the active ClawXpert conversation route', async () => {
    assistantBindingService.get.mockReturnValue(of(createBinding('xpert-busy')))
    assistantBindingService.getAvailableXperts.mockReturnValue(of([createXpert('xpert-busy', 'Busy Xpert')]))

    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    expect(facade.sidebarStatus()).toBe('idle')

    facade.setActiveConversation(createConversation('conversation-1', { status: 'busy' }))
    router.url = '/chat/clawxpert/c/thread-1'
    router.events.next(new NavigationEnd(1, router.url, router.url))
    await flushPromises()

    expect(facade.sidebarStatus()).toBe('busy')

    facade.patchActiveConversationStatus('idle')
    expect(facade.sidebarStatus()).toBe('idle')

    facade.setActiveConversation(null)
    expect(facade.sidebarStatus()).toBe('idle')
  })

  it('reports setup status when the ClawXpert binding is not ready', async () => {
    const facade = TestBed.inject(ClawXpertFacade)
    await flushPromises()

    expect(facade.sidebarStatus()).toBe('setup')
  })
})
