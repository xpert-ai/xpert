import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { of, throwError } from 'rxjs'
import {
  AssistantBindingService,
  EnvironmentService,
  IAssistantBinding,
  IXpert,
  Store,
  TXpertTeamDraft,
  ToastrService,
  XpertAPIService,
  XpertTaskService,
  XpertTypeEnum
} from '../../../@core'
import { ClawXpertFacade } from './clawxpert.facade'

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

function createXpert(id: string, name = id): IXpert {
  return {
    id,
    name,
    latest: true,
    type: XpertTypeEnum.Agent
  } as IXpert
}

function createBinding(assistantId: string): IAssistantBinding {
  return {
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

function createTeam(id: string, name = id): IXpert {
  return {
    ...createXpert(id, name),
    draft: createDraft(id)
  } as IXpert
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
  let environmentService: {
    getDefaultByWorkspace: jest.Mock
  }
  let taskService: {
    getMyAll: jest.Mock
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
    environmentService = {
      getDefaultByWorkspace: jest.fn(() => of(null))
    }
    taskService = {
      getMyAll: jest.fn(() => of({ items: [], total: 0 }))
    }

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        ClawXpertFacade,
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
})
