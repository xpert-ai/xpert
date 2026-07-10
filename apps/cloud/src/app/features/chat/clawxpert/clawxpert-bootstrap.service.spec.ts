const mockPluginAPI = {
  getPlugins: jest.fn(),
  install: jest.fn()
}

jest.mock('@xpert-ai/cloud/state', () => ({
  injectPluginAPI: () => mockPluginAPI
}))

jest.mock('../../../@core', () => ({
  AiModelTypeEnum: {
    LLM: 'llm'
  },
  AssistantBindingScope: {
    USER: 'user'
  },
  AssistantBindingService: class AssistantBindingService {},
  AssistantCode: {
    CLAWXPERT: 'clawxpert'
  },
  CopilotServerService: class CopilotServerService {},
  EnvironmentService: class EnvironmentService {},
  ToastrService: class ToastrService {},
  uid10: jest.fn(() => 'abc123def0'),
  XpertAPIService: class XpertAPIService {},
  XpertAgentService: class XpertAgentService {},
  XpertTemplateService: class XpertTemplateService {},
  XpertWorkspaceService: class XpertWorkspaceService {}
}))

import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import type { ICopilotModel, IPluginDescriptor, IXpert, TXpertTeamDraft, TXpertTemplate } from '@xpert-ai/contracts'
import { PLUGIN_LEVEL, XpertTypeEnum } from '@xpert-ai/contracts'
import { of, throwError } from 'rxjs'
import {
  AiModelTypeEnum,
  AssistantBindingScope,
  AssistantBindingService,
  AssistantCode,
  CopilotServerService,
  EnvironmentService,
  ToastrService,
  XpertAgentService,
  XpertAPIService,
  XpertTemplateService,
  XpertWorkspaceService
} from '../../../@core'
import { ClawXpertBootstrapService } from './clawxpert-bootstrap.service'
import { CLAWXPERT_TEMPLATE_ID } from './clawxpert-template.constants'

describe('ClawXpertBootstrapService', () => {
  function setup() {
    const assistantBindingService = {
      upsert: jest.fn(() =>
        of({
          code: AssistantCode.CLAWXPERT,
          scope: AssistantBindingScope.USER,
          assistantId: 'created-clawxpert'
        })
      )
    }
    const router = {
      navigate: jest.fn(() => Promise.resolve(true))
    }
    const environmentService = {
      getDefaultByWorkspace: jest.fn(() => of(null))
    }
    const xpertAgentService = {
      refresh: jest.fn()
    }
    const xpertService = {
      getTeam: jest.fn(() =>
        of({
          ...createXpert('created-clawxpert'),
          agent: {
            key: 'agent-created'
          },
          draft: createDraft()
        })
      ),
      publish: jest.fn(() => of(createXpert('created-clawxpert'))),
      saveDraft: jest.fn(() => of(createDraft()))
    }
    const xpertTemplateService = {
      getTemplate: jest.fn(),
      installTemplate: jest.fn()
    }
    const workspaceService = {
      create: jest.fn(),
      getMyDefault: jest.fn(() => of({ id: 'workspace-1' })),
      refresh: jest.fn(),
      setMyDefault: jest.fn()
    }
    const toastrService = {
      warning: jest.fn()
    }

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        ClawXpertBootstrapService,
        {
          provide: AssistantBindingService,
          useValue: assistantBindingService
        },
        {
          provide: CopilotServerService,
          useValue: {}
        },
        {
          provide: EnvironmentService,
          useValue: environmentService
        },
        {
          provide: Router,
          useValue: router
        },
        {
          provide: ToastrService,
          useValue: toastrService
        },
        {
          provide: XpertAPIService,
          useValue: xpertService
        },
        {
          provide: XpertAgentService,
          useValue: xpertAgentService
        },
        {
          provide: XpertTemplateService,
          useValue: xpertTemplateService
        },
        {
          provide: XpertWorkspaceService,
          useValue: workspaceService
        }
      ]
    })

    return {
      assistantBindingService,
      router,
      service: TestBed.inject(ClawXpertBootstrapService),
      toastrService,
      xpertAgentService,
      xpertService,
      xpertTemplateService
    }
  }

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('binds the created ClawXpert and marks the next conversation before opening chat', async () => {
    const { assistantBindingService, router, service } = setup()

    await service.bindAndOpenCreatedClawXpert(createXpert('created-clawxpert'))

    expect(assistantBindingService.upsert).toHaveBeenCalledWith({
      code: AssistantCode.CLAWXPERT,
      scope: AssistantBindingScope.USER,
      assistantId: 'created-clawxpert'
    })
    expect(router.navigate).toHaveBeenCalledWith(['/chat/clawxpert', 'c'])
    expect(service.readPendingCreatedClawXpert('created-clawxpert')?.id).toBe('created-clawxpert')
    expect(service.consumePendingCreatedConversationXpertId('created-clawxpert')).toBe('created-clawxpert')
    expect(service.consumePendingCreatedConversationXpertId('created-clawxpert')).toBeNull()
    expect(service.readPendingCreatedClawXpert('created-clawxpert')?.id).toBe('created-clawxpert')

    service.clearPendingCreatedClawXpert('created-clawxpert')

    expect(service.readPendingCreatedClawXpert('created-clawxpert')).toBeNull()
  })

  it('clears the pending created conversation marker when binding fails', async () => {
    const { assistantBindingService, service } = setup()
    assistantBindingService.upsert.mockReturnValue(throwError(() => new Error('bind failed')))

    await expect(service.bindAndOpenCreatedClawXpert(createXpert('created-clawxpert'))).rejects.toThrow('bind failed')

    expect(service.consumePendingCreatedConversationXpertId('created-clawxpert')).toBeNull()
    expect(service.readPendingCreatedClawXpert('created-clawxpert')).toBeNull()
  })

  it('clears the pending created conversation marker when chat navigation fails', async () => {
    const { router, service } = setup()
    router.navigate.mockResolvedValue(false)

    await expect(service.bindAndOpenCreatedClawXpert(createXpert('created-clawxpert'))).rejects.toThrow(
      'Failed to open the ClawXpert conversation.'
    )

    expect(service.consumePendingCreatedConversationXpertId('created-clawxpert')).toBeNull()
    expect(service.readPendingCreatedClawXpert('created-clawxpert')).toBeNull()
  })

  it('installs template plugins before creating ClawXpert', async () => {
    const { service, xpertAgentService, xpertTemplateService } = setup()
    xpertTemplateService.getTemplate.mockReturnValue(
      of({
        dependencies: {
          plugins: ['@xpert-ai/plugin-file-memory']
        }
      })
    )
    xpertTemplateService.installTemplate.mockReturnValue(of({ xpert: createXpert('created-clawxpert') }))
    mockPluginAPI.getPlugins.mockReturnValue(of([]))
    mockPluginAPI.install.mockReturnValue(of({ success: true }))

    await service.createClawXpert(createCopilotModel())

    expect(mockPluginAPI.install).toHaveBeenCalledWith({ pluginName: '@xpert-ai/plugin-file-memory' })
    expect(xpertTemplateService.getTemplate.mock.invocationCallOrder[0]).toBeLessThan(
      xpertTemplateService.installTemplate.mock.invocationCallOrder[0]
    )
    expect(mockPluginAPI.install.mock.invocationCallOrder[0]).toBeLessThan(
      xpertTemplateService.installTemplate.mock.invocationCallOrder[0]
    )
    expect(xpertAgentService.refresh).toHaveBeenCalledTimes(1)
  })

  it('uses a stable title and a unique internal name when creating ClawXpert', async () => {
    const { service, xpertTemplateService } = setup()
    xpertTemplateService.getTemplate.mockReturnValue(of({ dependencies: {} }))
    xpertTemplateService.installTemplate.mockReturnValue(of({ xpert: createXpert('created-clawxpert') }))

    await service.createClawXpert(createCopilotModel())

    expect(xpertTemplateService.installTemplate).toHaveBeenCalledWith(CLAWXPERT_TEMPLATE_ID, {
      workspaceId: 'workspace-1',
      basic: {
        name: 'clawxpert-abc123',
        title: 'ClawXpert',
        copilotModel: createCopilotModel()
      }
    })
  })

  it('refreshes middleware providers when template plugins are already installed', async () => {
    const { service, xpertAgentService, xpertTemplateService } = setup()
    xpertTemplateService.getTemplate.mockReturnValue(
      of({
        dependencies: {
          plugins: ['@xpert-ai/plugin-file-memory']
        }
      })
    )
    xpertTemplateService.installTemplate.mockReturnValue(of({ xpert: createXpert('created-clawxpert') }))
    const installedPlugin: IPluginDescriptor = {
      name: '@xpert-ai/plugin-file-memory@0.2.1',
      packageName: '@xpert-ai/plugin-file-memory',
      isGlobal: false,
      level: PLUGIN_LEVEL.ORGANIZATION,
      effectiveInCurrentScope: true,
      meta: {
        name: '@xpert-ai/plugin-file-memory',
        version: '0.2.1',
        category: 'middleware',
        displayName: 'File memory',
        description: 'File memory',
        author: 'XpertAI'
      }
    }
    mockPluginAPI.getPlugins.mockReturnValue(of([installedPlugin]))

    await service.createClawXpert(createCopilotModel())

    expect(mockPluginAPI.install).not.toHaveBeenCalled()
    expect(xpertAgentService.refresh).toHaveBeenCalledTimes(1)
  })

  it('continues creating ClawXpert when plugin preparation fails', async () => {
    const { service, toastrService, xpertTemplateService } = setup()
    xpertTemplateService.getTemplate.mockReturnValue(
      of({
        dependencies: {
          plugins: ['@xpert-ai/plugin-file-memory']
        }
      })
    )
    xpertTemplateService.installTemplate.mockReturnValue(of({ xpert: createXpert('created-clawxpert') }))
    mockPluginAPI.getPlugins.mockReturnValue(of([]))
    mockPluginAPI.install.mockReturnValue(throwError(() => new Error('install failed')))

    await expect(service.createClawXpert(createCopilotModel())).resolves.toMatchObject({
      id: 'created-clawxpert'
    })

    expect(xpertTemplateService.installTemplate).toHaveBeenCalled()
    expect(toastrService.warning).toHaveBeenCalledWith('PAC.Chat.ClawXpert.PluginPrepareFailed', {
      Default:
        'Digital expert was created, but plugin preparation did not finish. Some middleware may appear missing until plugins are installed.'
    })
  })

  it('suppresses plugin preparation warnings when requested by setup', async () => {
    const { service, toastrService, xpertTemplateService } = setup()
    xpertTemplateService.getTemplate.mockReturnValue(
      of({
        dependencies: {
          plugins: ['@xpert-ai/plugin-file-memory']
        }
      })
    )
    xpertTemplateService.installTemplate.mockReturnValue(of({ xpert: createXpert('created-clawxpert') }))
    mockPluginAPI.getPlugins.mockReturnValue(of([]))
    mockPluginAPI.install.mockReturnValue(throwError(() => new Error('install failed')))

    await expect(
      service.createClawXpert(createCopilotModel(), {
        suppressPluginPrepareWarning: true
      })
    ).resolves.toMatchObject({
      id: 'created-clawxpert'
    })

    expect(xpertTemplateService.installTemplate).toHaveBeenCalled()
    expect(toastrService.warning).not.toHaveBeenCalled()
  })

  it('suppresses auto publish warnings when requested by setup', async () => {
    const { service, toastrService, xpertService, xpertTemplateService } = setup()
    xpertTemplateService.getTemplate.mockReturnValue(
      of({
        dependencies: {}
      })
    )
    xpertTemplateService.installTemplate.mockReturnValue(of({ xpert: createXpert('created-clawxpert') }))
    xpertService.publish.mockReturnValue(throwError(() => new Error('publish failed')))

    await expect(
      service.createClawXpert(createCopilotModel(), {
        suppressAutoPublishWarning: true
      })
    ).resolves.toMatchObject({
      id: 'created-clawxpert'
    })

    expect(xpertService.publish).toHaveBeenCalled()
    expect(toastrService.warning).not.toHaveBeenCalled()
  })

  it('installs and publishes a recommended template directly', async () => {
    const { service, xpertService, xpertTemplateService } = setup()
    const template: TXpertTemplate = {
      id: '@xpert-ai/plugin-canvas:canvas-assistant',
      name: 'canvas-assistant',
      title: 'Canvas Assistant',
      description: 'Canvas template',
      category: 'Canvas',
      copyright: '',
      export_data: '',
      avatar: {
        emoji: {
          id: 'art'
        }
      },
      type: XpertTypeEnum.Agent
    }
    xpertTemplateService.getTemplate.mockReturnValue(
      of({
        id: template.id,
        dependencies: {}
      })
    )
    xpertTemplateService.installTemplate.mockReturnValue(of({ xpert: createXpert('created-canvas') }))
    xpertService.getTeam.mockReturnValue(
      of({
        ...createXpert('created-canvas'),
        agent: {
          key: 'agent-created'
        },
        draft: createDraft()
      })
    )
    xpertService.publish.mockReturnValue(of(createXpert('created-canvas')))

    await expect(service.createTemplateXpert(template, createCopilotModel())).resolves.toMatchObject({
      id: 'created-canvas'
    })

    expect(xpertTemplateService.installTemplate).toHaveBeenCalledWith(template.id, {
      workspaceId: 'workspace-1',
      basic: {
        name: 'canvas-assistant-abc123',
        title: 'Canvas Assistant',
        description: 'Canvas template',
        avatar: {
          emoji: {
            id: 'art'
          }
        },
        copilotModel: createCopilotModel()
      }
    })
    expect(xpertService.publish).toHaveBeenCalledWith('created-canvas', false, {
      environmentId: null,
      releaseNotes: 'Initial template bootstrap release.'
    })
  })

  it('creates ClawXpert when the template omits required plugin dependencies', async () => {
    const { service, xpertTemplateService } = setup()
    xpertTemplateService.getTemplate.mockReturnValue(
      of({
        dependencies: {},
        export_data: 'team:\n  name: ClawXpert\n'
      })
    )
    xpertTemplateService.installTemplate.mockReturnValue(of({ xpert: createXpert('created-clawxpert') }))

    await expect(service.createClawXpert(createCopilotModel())).resolves.toMatchObject({
      id: 'created-clawxpert'
    })

    expect(mockPluginAPI.getPlugins).not.toHaveBeenCalled()
    expect(mockPluginAPI.install).not.toHaveBeenCalled()
    expect(xpertTemplateService.installTemplate).toHaveBeenCalled()
  })
})

function createCopilotModel(): ICopilotModel {
  return {
    copilotId: 'copilot-1',
    model: 'gpt-4o',
    modelType: AiModelTypeEnum.LLM
  }
}

function createXpert(id: string): IXpert {
  return {
    id,
    name: id,
    slug: id,
    latest: true,
    type: XpertTypeEnum.Agent,
    workspaceId: 'workspace-1'
  } as IXpert
}

function createDraft(): TXpertTeamDraft {
  return {
    team: {
      agent: {
        key: 'agent-template'
      }
    },
    nodes: [
      {
        type: 'agent',
        key: 'agent-template',
        position: {
          x: 0,
          y: 0
        },
        entity: {
          key: 'agent-template'
        }
      }
    ],
    connections: []
  } as TXpertTeamDraft
}
