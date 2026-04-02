import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { Store } from '@metad/cloud/state'
import { of } from 'rxjs'
import {
  EnvironmentService,
  KnowledgebaseService,
  ToastrService,
  XpertAgentService,
  XpertAPIService,
  XpertTemplateService,
  XpertWorkspaceService,
  XpertTypeEnum
} from '../../../../@core'
import { BlankXpertDialogData, XpertNewBlankComponent } from './blank.component'

type BlankSpecContext = {
  component: XpertNewBlankComponent
  dialogRef: { close: jest.Mock }
  environmentService: { getDefaultByWorkspace: jest.Mock }
  fixture: ComponentFixture<XpertNewBlankComponent>
  knowledgebaseService: {
    create: jest.Mock
    delete: jest.Mock
    documentSourceStrategies$: any
    documentTransformerStrategies$: any
    textSplitterStrategies$: any
    understandingStrategies$: any
    update: jest.Mock
  }
  templateService: {
    getAll: jest.Mock
    getAllKnowledgePipelines: jest.Mock
    getKnowledgePipelineTemplate: jest.Mock
    getTemplate: jest.Mock
  }
  toastr: { error: jest.Mock; success: jest.Mock; warning: jest.Mock }
  xpertAgentService: { agentMiddlewares$: any }
  xpertService: {
    create: jest.Mock
    delete: jest.Mock
    getTeam: jest.Mock
    getTriggerProviders: jest.Mock
    importDSL: jest.Mock
    publish: jest.Mock
    saveDraft: jest.Mock
  }
  workspaceService: { getAllMy: jest.Mock }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

function createAgentXpert(id = 'xpert-1') {
  return {
    id,
    name: 'blank-expert',
    slug: 'blank-expert',
    type: XpertTypeEnum.Agent,
    title: 'Blank Expert',
    latest: true,
    workspaceId: 'workspace-1',
    agent: {
      id: 'agent-1',
      key: 'Agent_primary',
      name: 'primary-agent',
      title: 'Primary Agent',
      options: {
        vision: {
          enabled: true
        }
      }
    }
  } as any
}

function createAgentTemplateYaml() {
  return `
team:
  name: template-agent
  type: agent
  title: Template Agent
  description: Template agent description
  avatar:
    emoji:
      id: robot_face
    background: rgb(213, 245, 246)
  copilotModel:
    modelType: llm
    model: gpt-4o
  agent:
    key: Agent_primary
    options:
      middlewares:
        order:
          - Middleware_guard
nodes:
  - type: agent
    key: Agent_primary
    position:
      x: 360
      y: 220
    entity:
      key: Agent_primary
  - type: workflow
    key: Trigger_schedule
    position:
      x: 120
      y: 220
    entity:
      key: Trigger_schedule
      type: trigger
      from: schedule
      config:
        cron: '0 * * * *'
  - type: workflow
    key: Middleware_guard
    position:
      x: 360
      y: 460
    entity:
      key: Middleware_guard
      type: middleware
      provider: guard
      title: guard
  - type: workflow
    key: Skill_writer
    position:
      x: 620
      y: 220
    entity:
      key: Skill_writer
      type: skill
      title: writer
      skills:
        - writer
connections:
  - key: Trigger_schedule/Agent_primary
    type: edge
    from: Trigger_schedule
    to: Agent_primary
  - key: Agent_primary/Middleware_guard
    type: workflow
    from: Agent_primary
    to: Middleware_guard
  - key: Agent_primary/Skill_writer
    type: workflow
    from: Agent_primary
    to: Skill_writer
`
}

async function createComponent(
  data: BlankXpertDialogData,
  options?: {
    agentTemplateDetail?: { export_data: string }
    agentTemplates?: any[]
    createdXpert?: any
    importedXpert?: any
    publishedXpert?: any
    selectedWorkspace?: any | null
    teamResponse?: any
    triggerProviders?: any[]
    workspaces?: any[]
  }
): Promise<BlankSpecContext> {
  const dialogRef = {
    close: jest.fn()
  }
  const createdXpert = options?.createdXpert ?? createAgentXpert()
  const importedXpert = options?.importedXpert ?? createdXpert
  const publishedXpert = options?.publishedXpert ?? { ...createdXpert, version: '1.0.0' }
  const triggerProviders = options?.triggerProviders ?? []
  const workspaces = options?.workspaces ?? []
  const agentTemplates = options?.agentTemplates ?? []
  const agentTemplateDetail = options?.agentTemplateDetail ?? { export_data: createAgentTemplateYaml() }
  const teamResponse = options?.teamResponse ?? { ...createdXpert, draft: { checklist: [] } }

  const xpertService = {
    create: jest.fn(() => of(createdXpert)),
    delete: jest.fn(() => of(null)),
    getTeam: jest.fn(() => of(teamResponse)),
    getTriggerProviders: jest.fn(() => of(triggerProviders)),
    importDSL: jest.fn(() => of(importedXpert)),
    publish: jest.fn(() => of(publishedXpert)),
    saveDraft: jest.fn(() => of({ checklist: [] }))
  }
  const xpertAgentService = {
    agentMiddlewares$: of([])
  }
  const templateService = {
    getAll: jest.fn(() => of({ categories: ['Agent'], recommendedApps: agentTemplates })),
    getAllKnowledgePipelines: jest.fn(() => of({ categories: ['Pipeline'], templates: [] })),
    getKnowledgePipelineTemplate: jest.fn(),
    getTemplate: jest.fn(() => of(agentTemplateDetail))
  }
  const workspaceService = {
    getAllMy: jest.fn(() => of({ items: workspaces }))
  }
  const knowledgebaseService = {
    create: jest.fn(() => of(null)),
    delete: jest.fn(() => of(null)),
    documentSourceStrategies$: of([]),
    documentTransformerStrategies$: of([]),
    textSplitterStrategies$: of([]),
    understandingStrategies$: of([]),
    update: jest.fn(() => of(null))
  }
  const environmentService = {
    getDefaultByWorkspace: jest.fn(() => of({ id: 'env-1' }))
  }
  const toastr = {
    error: jest.fn(),
    success: jest.fn(),
    warning: jest.fn()
  }
  const store = {
    selectedWorkspace$: of(options?.selectedWorkspace ?? null)
  }

  TestBed.resetTestingModule()
  TestBed.overrideComponent(XpertNewBlankComponent, {
    set: {
      template: ''
    }
  })

  await TestBed.configureTestingModule({
    imports: [XpertNewBlankComponent],
    providers: [
      {
        provide: DIALOG_DATA,
        useValue: data
      },
      {
        provide: DialogRef,
        useValue: dialogRef
      },
      {
        provide: Store,
        useValue: store
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
        useValue: templateService
      },
      {
        provide: XpertWorkspaceService,
        useValue: workspaceService
      },
      {
        provide: KnowledgebaseService,
        useValue: knowledgebaseService
      },
      {
        provide: EnvironmentService,
        useValue: environmentService
      },
      {
        provide: ToastrService,
        useValue: toastr
      }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(XpertNewBlankComponent)
  const component = fixture.componentInstance

  Object.defineProperty(component, 'basicForm', {
    value: () => ({
      checking: () => false,
      invalid: () => false
    })
  })

  fixture.detectChanges()
  await fixture.whenStable()
  await flushPromises()

  return {
    component,
    dialogRef,
    environmentService,
    fixture,
    knowledgebaseService,
    templateService,
    toastr,
    workspaceService,
    xpertAgentService,
    xpertService
  }
}

describe('XpertNewBlankComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('blocks submit in ClawXpert publish mode when no workspace is selected', async () => {
    const { component, xpertService } = await createComponent(
      {
        allowWorkspaceSelection: true,
        allowedModes: [XpertTypeEnum.Agent],
        completionMode: 'publish',
        type: XpertTypeEnum.Agent,
        workspace: null
      },
      {
        selectedWorkspace: null,
        workspaces: [{ id: 'workspace-1', name: 'Workspace One' }]
      }
    )

    expect(component.workspaceSelectionInvalid()).toBe(true)
    expect(component.basicStepInvalid()).toBe(true)

    component.create()

    expect(xpertService.create).not.toHaveBeenCalled()
  })

  it('blocks submit when a selected trigger is missing required config', async () => {
    const { component, xpertService } = await createComponent(
      {
        completionMode: 'publish',
        type: XpertTypeEnum.Agent
      },
      {
        triggerProviders: [
          {
            name: 'schedule',
            label: {
              en_US: 'Schedule'
            },
            configSchema: {
              type: 'object',
              required: ['cron'],
              properties: {
                cron: {
                  type: 'string'
                }
              }
            }
          }
        ]
      }
    )

    component.selectedTriggers.set([{ provider: 'schedule', config: {} }])

    expect(component.selectedTriggersInvalid()).toBe(true)

    component.create()

    expect(xpertService.create).not.toHaveBeenCalled()
  })

  it('requires a selected template before continuing in template start mode', async () => {
    const { component, xpertService } = await createComponent(
      {
        completionMode: 'publish',
        type: XpertTypeEnum.Agent
      },
      {
        agentTemplates: [
          {
            id: 'template-agent',
            name: 'template-agent',
            title: 'Template Agent',
            description: 'Template agent description',
            category: 'Agent',
            type: XpertTypeEnum.Agent,
            avatar: {
              emoji: {
                id: 'robot_face'
              },
              background: 'rgb(213, 245, 246)'
            }
          }
        ]
      }
    )

    component.setStartMode('template')

    expect(component.startStepInvalid()).toBe(true)

    component.create()

    expect(xpertService.create).not.toHaveBeenCalled()
    expect(xpertService.importDSL).not.toHaveBeenCalled()
  })

  it('loads the selected agent template into the wizard state', async () => {
    const { component, fixture, templateService } = await createComponent(
      {
        type: XpertTypeEnum.Agent
      },
      {
        agentTemplates: [
          {
            id: 'template-agent',
            name: 'template-agent',
            title: 'Template Agent',
            description: 'Template agent description',
            category: 'Agent',
            type: XpertTypeEnum.Agent,
            avatar: {
              emoji: {
                id: 'robot_face'
              },
              background: 'rgb(213, 245, 246)'
            }
          }
        ]
      }
    )

    component.setStartMode('template')
    component.selectedTemplateId.set('template-agent')
    fixture.detectChanges()
    await fixture.whenStable()
    await flushPromises()

    expect(templateService.getTemplate).toHaveBeenCalledWith('template-agent')
    expect(component.startStepInvalid()).toBe(false)
    expect(component.name()).toBe('template-agent')
    expect(component.title()).toBe('Template Agent')
    expect(component.description()).toBe('Template agent description')
    expect(component.selectedTriggers()).toEqual([
      {
        provider: 'schedule',
        config: {
          cron: '0 * * * *'
        }
      }
    ])
    expect(component.selectedMiddlewares()).toEqual(['guard'])
    expect(component.selectedSkills()).toEqual(['writer'])
  })

  it('closes with published status after a successful publish flow', async () => {
    const createdXpert = createAgentXpert('created-xpert')
    const publishedXpert = {
      ...createdXpert,
      version: '1.0.0'
    }
    const { component, dialogRef, environmentService, fixture, xpertService } = await createComponent(
      {
        completionMode: 'publish',
        type: XpertTypeEnum.Agent
      },
      {
        createdXpert,
        publishedXpert
      }
    )

    component.create()
    await fixture.whenStable()
    await flushPromises()

    expect(xpertService.create).toHaveBeenCalled()
    expect(xpertService.saveDraft).toHaveBeenCalled()
    expect(environmentService.getDefaultByWorkspace).toHaveBeenCalledWith('workspace-1')
    expect(xpertService.publish).toHaveBeenCalledWith(
      'created-xpert',
      false,
      expect.objectContaining({
        environmentId: 'env-1',
        releaseNotes: 'Initial ClawXpert bootstrap release.'
      })
    )
    expect(dialogRef.close).toHaveBeenCalledWith({
      xpert: publishedXpert,
      status: 'published'
    })
  })

  it('imports a selected template and publishes when the imported checklist is clean', async () => {
    const importedXpert = createAgentXpert('imported-xpert')
    const publishedXpert = {
      ...importedXpert,
      version: '1.0.0'
    }
    const { component, dialogRef, environmentService, fixture, xpertService } = await createComponent(
      {
        completionMode: 'publish',
        type: XpertTypeEnum.Agent
      },
      {
        agentTemplates: [
          {
            id: 'template-agent',
            name: 'template-agent',
            title: 'Template Agent',
            description: 'Template agent description',
            category: 'Agent',
            type: XpertTypeEnum.Agent,
            avatar: {
              emoji: {
                id: 'robot_face'
              },
              background: 'rgb(213, 245, 246)'
            }
          }
        ],
        importedXpert,
        publishedXpert,
        teamResponse: {
          ...importedXpert,
          draft: {
            checklist: []
          }
        }
      }
    )

    component.setStartMode('template')
    component.selectedTemplateId.set('template-agent')
    fixture.detectChanges()
    await fixture.whenStable()
    await flushPromises()

    component.create()
    await fixture.whenStable()
    await flushPromises()

    expect(xpertService.create).not.toHaveBeenCalled()
    expect(xpertService.importDSL).toHaveBeenCalledWith(
      expect.objectContaining({
        team: expect.objectContaining({
          name: 'template-agent',
          title: 'Template Agent',
          workspaceId: undefined
        })
      })
    )
    expect(xpertService.saveDraft).not.toHaveBeenCalled()
    expect(environmentService.getDefaultByWorkspace).toHaveBeenCalledWith('workspace-1')
    expect(xpertService.publish).toHaveBeenCalledWith(
      'imported-xpert',
      false,
      expect.objectContaining({
        environmentId: 'env-1',
        releaseNotes: 'Initial ClawXpert bootstrap release.'
      })
    )
    expect(dialogRef.close).toHaveBeenCalledWith({
      xpert: publishedXpert,
      status: 'published'
    })
  })

  it('keeps the imported xpert as created when the imported checklist is blocked', async () => {
    const importedXpert = createAgentXpert('imported-xpert')
    const { component, dialogRef, fixture, toastr, xpertService } = await createComponent(
      {
        completionMode: 'publish',
        type: XpertTypeEnum.Agent
      },
      {
        agentTemplates: [
          {
            id: 'template-agent',
            name: 'template-agent',
            title: 'Template Agent',
            description: 'Template agent description',
            category: 'Agent',
            type: XpertTypeEnum.Agent,
            avatar: {
              emoji: {
                id: 'robot_face'
              },
              background: 'rgb(213, 245, 246)'
            }
          }
        ],
        importedXpert,
        teamResponse: {
          ...importedXpert,
          draft: {
            checklist: [{ level: 'error' }]
          }
        }
      }
    )

    component.setStartMode('template')
    component.selectedTemplateId.set('template-agent')
    fixture.detectChanges()
    await fixture.whenStable()
    await flushPromises()

    component.create()
    await fixture.whenStable()
    await flushPromises()

    expect(xpertService.importDSL).toHaveBeenCalled()
    expect(xpertService.publish).not.toHaveBeenCalled()
    expect(toastr.warning).toHaveBeenCalled()
    expect(dialogRef.close).toHaveBeenCalledWith({
      xpert: importedXpert,
      status: 'created'
    })
  })
})
