import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { Store } from '@xpert-ai/cloud/state'
import { TranslateService } from '@ngx-translate/core'
import { of } from 'rxjs'
import {
  AiModelTypeEnum,
  EnvironmentService,
  KnowledgebaseService,
  SkillPackageService,
  SkillRepositoryService,
  ToastrService,
  XpertAgentService,
  XpertAPIService,
  XpertTemplateService,
  XpertWorkspaceService,
  XpertTypeEnum
} from '../../../../@core'
import { BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER } from './blank-draft.util'
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
  skillPackageService: {
    getAllByWorkspace: jest.Mock
    installPackage: jest.Mock
    installRepositoryPackages: jest.Mock
  }
  skillRepositoryService: {
    getAllInOrg: jest.Mock
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

function buildExpectedClawPrompt() {
  return [
    'When available, use the following runtime preference context to guide how you respond.',
    '',
    'Assistant soul:',
    '{{sys.soul}}',
    '',
    'User profile:',
    '{{sys.profile}}',
    '',
    'Treat the assistant soul as behavior guidance and use the user profile to personalize responses when relevant.'
  ].join('\n')
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
          - Middleware_skills
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
    key: Middleware_skills
    position:
      x: 360
      y: 580
    entity:
      key: Middleware_skills
      type: middleware
      provider: ${BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER}
      title: Skills Middleware
      options:
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
  - key: Agent_primary/Middleware_skills
    type: workflow
    from: Agent_primary
    to: Middleware_skills
`
}

function createLegacyAgentTemplateYaml() {
  return `
team:
  name: template-agent
  type: agent
  title: Template Agent
  description: Template agent description
  agent:
    key: Agent_primary
nodes:
  - type: agent
    key: Agent_primary
    position:
      x: 360
      y: 220
    entity:
      key: Agent_primary
  - type: workflow
    key: Middleware_model_retry
    position:
      x: 360
      y: 420
    entity:
      key: Middleware_model_retry
      type: middleware
      provider: ModelRetryMiddleware
      title: ModelRetryMiddleware
  - type: workflow
    key: Middleware_web_tools
    position:
      x: 360
      y: 540
    entity:
      key: Middleware_web_tools
      type: middleware
      provider: WebTools
      title: WebTools
  - type: workflow
    key: Middleware_summary
    position:
      x: 360
      y: 660
    entity:
      key: Middleware_summary
      type: middleware
      provider: SummarizationMiddleware
      title: SummarizationMiddleware
  - type: workflow
    key: Middleware_todo
    position:
      x: 360
      y: 780
    entity:
      key: Middleware_todo
      type: middleware
      provider: todoListMiddleware
      title: todoListMiddleware
connections:
  - key: Agent_primary/Middleware_model_retry
    type: workflow
    from: Agent_primary
    to: Middleware_model_retry
  - key: Agent_primary/Middleware_web_tools
    type: workflow
    from: Agent_primary
    to: Middleware_web_tools
  - key: Agent_primary/Middleware_summary
    type: workflow
    from: Agent_primary
    to: Middleware_summary
  - key: Agent_primary/Middleware_todo
    type: workflow
    from: Agent_primary
    to: Middleware_todo
`
}

function createAgentTemplateYamlWithPrimaryAgentModelOnly() {
  return `
team:
  name: template-agent
  type: agent
  title: Template Agent
  description: Template agent description
  agent:
    key: Agent_primary
    options:
      middlewares:
        order:
          - Middleware_summary
nodes:
  - type: agent
    key: Agent_primary
    position:
      x: 360
      y: 220
    entity:
      key: Agent_primary
      copilotModel:
        copilotId: copilot-glm
        modelType: llm
        model: glm-5
  - type: workflow
    key: Middleware_summary
    position:
      x: 360
      y: 460
    entity:
      key: Middleware_summary
      type: middleware
      provider: SummarizationMiddleware
      title: SummarizationMiddleware
connections:
  - key: Agent_primary/Middleware_summary
    type: workflow
    from: Agent_primary
    to: Middleware_summary
`
}

async function createComponent(
  data: BlankXpertDialogData,
  options?: {
    agentTemplateDetail?: { export_data: string }
    agentTemplates?: any[]
    createdXpert?: any
    importedXpert?: any
    installedSkillPackage?: any
    middlewareProviders?: any[]
    publishedXpert?: any
    repositories?: any[]
    selectedWorkspace?: any | null
    teamResponse?: any
    triggerProviders?: any[]
    workspaceSkills?: any[]
    workspaces?: any[]
  }
): Promise<BlankSpecContext> {
  const dialogRef = {
    close: jest.fn()
  }
  const createdXpert = options?.createdXpert ?? createAgentXpert()
  const importedXpert = options?.importedXpert ?? createdXpert
  const publishedXpert = options?.publishedXpert ?? { ...createdXpert, version: '1.0.0' }
  const installedSkillPackage = options?.installedSkillPackage ?? { id: 'installed-skill' }
  const middlewareProviders = options?.middlewareProviders ?? []
  const repositories = options?.repositories ?? [
    { id: 'repo-public', provider: 'workspace-public', name: 'Workspace Shared Skills' }
  ]
  const triggerProviders = options?.triggerProviders ?? []
  const workspaceSkills = options?.workspaceSkills ?? []
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
    agentMiddlewares$: of(middlewareProviders)
  }
  const skillPackageService = {
    getAllByWorkspace: jest.fn(() => of({ items: workspaceSkills })),
    installPackage: jest.fn(() => of(installedSkillPackage)),
    installRepositoryPackages: jest.fn(() => of([]))
  }
  const skillRepositoryService = {
    getAllInOrg: jest.fn(() => of({ items: repositories }))
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
  const translate = {
    instant: jest.fn((key: string, params?: Record<string, string>) => params?.Default ?? key)
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
        provide: SkillPackageService,
        useValue: skillPackageService
      },
      {
        provide: SkillRepositoryService,
        useValue: skillRepositoryService
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
      },
      {
        provide: TranslateService,
        useValue: translate
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
    skillPackageService,
    skillRepositoryService,
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

  it('blocks submit in publish mode when no workspace is selected', async () => {
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

    await component.create()

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

    await component.create()

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

    await component.create()

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
    expect(component.selectedSkills()).toEqual(['writer'])
    expect(component.selectedRepositoryDefault()).toBeNull()
    expect(component.selectedMiddlewares()).toEqual(['guard', BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER])
  })

  it('surfaces template-selected middlewares even when the runtime no longer provides them', async () => {
    const { component, fixture } = await createComponent(
      {
        type: XpertTypeEnum.Agent
      },
      {
        agentTemplateDetail: {
          export_data: createLegacyAgentTemplateYaml()
        },
        agentTemplates: [
          {
            id: 'template-agent',
            name: 'template-agent',
            title: 'Template Agent',
            description: 'Template agent description',
            category: 'Agent',
            type: XpertTypeEnum.Agent
          }
        ],
        middlewareProviders: [
          {
            meta: {
              name: 'SummarizationMiddleware',
              label: {
                en_US: 'Summarization Middleware'
              }
            }
          },
          {
            meta: {
              name: 'todoListMiddleware',
              label: {
                en_US: 'Todo List Middleware'
              }
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

    expect(component.selectedMiddlewares()).toEqual([
      'ModelRetryMiddleware',
      'WebTools',
      'SummarizationMiddleware',
      'todoListMiddleware'
    ])
    expect(component.middlewareProviderOptions().map((provider) => provider.meta.name)).toEqual([
      'SummarizationMiddleware',
      'todoListMiddleware',
      'ModelRetryMiddleware',
      'WebTools'
    ])
    expect(
      component
        .middlewareProviderOptions()
        .filter((provider) => provider.unavailable)
        .map((provider) => provider.meta.name)
    ).toEqual(['ModelRetryMiddleware', 'WebTools'])
  })

  it('syncs workspace public skills on first skills-step entry and defaults them on while leaving local skills opt-in', async () => {
    const workspaceSkills = [
      {
        id: 'skill-local',
        metadata: {
          displayName: {
            en_US: 'Local Skill'
          }
        }
      }
    ] as any[]
    const { component, fixture, skillPackageService, skillRepositoryService } = await createComponent(
      {
        type: XpertTypeEnum.Agent,
        workspace: {
          id: 'workspace-1',
          name: 'Workspace One'
        } as any
      },
      {
        workspaceSkills
      }
    )

    skillPackageService.installRepositoryPackages.mockImplementation(() => {
      workspaceSkills.splice(
        0,
        workspaceSkills.length,
        {
          id: 'skill-public',
          metadata: {
            displayName: {
              en_US: 'Public Skill'
            }
          },
          skillIndex: {
            repositoryId: 'repo-public',
            repository: {
              id: 'repo-public',
              provider: 'workspace-public',
              name: 'Workspace Shared Skills'
            }
          }
        },
        {
          id: 'skill-local',
          metadata: {
            displayName: {
              en_US: 'Local Skill'
            }
          }
        }
      )
      return of([{ id: 'skill-public' }])
    })

    await component.onAgentStepChange({ selectedIndex: 4 } as any)
    fixture.detectChanges()
    await fixture.whenStable()
    await flushPromises()

    expect(skillRepositoryService.getAllInOrg).toHaveBeenCalled()
    expect(skillPackageService.installRepositoryPackages).toHaveBeenCalledWith('workspace-1', 'repo-public')
    expect(component.selectedRepositoryDefault()).toEqual({
      repositoryId: 'repo-public',
      disabledSkillIds: []
    })
    expect(component.selectedSkills()).toEqual(['skill-public'])
    expect(component.selectedMiddlewares()).toEqual([BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER])
  })

  it('defaults all loaded workspace skills to selected during claw setup', async () => {
    const workspaceSkills = [
      {
        id: 'skill-local',
        metadata: {
          displayName: {
            en_US: 'Local Skill'
          }
        }
      }
    ] as any[]
    const { component, fixture, skillPackageService, skillRepositoryService } = await createComponent(
      {
        category: 'claw',
        type: XpertTypeEnum.Agent,
        workspace: {
          id: 'workspace-1',
          name: 'Workspace One'
        } as any
      },
      {
        workspaceSkills
      }
    )

    skillPackageService.installRepositoryPackages.mockImplementation(() => {
      workspaceSkills.splice(
        0,
        workspaceSkills.length,
        {
          id: 'skill-public',
          metadata: {
            displayName: {
              en_US: 'Public Skill'
            }
          },
          skillIndex: {
            repositoryId: 'repo-public',
            repository: {
              id: 'repo-public',
              provider: 'workspace-public',
              name: 'Workspace Shared Skills'
            }
          }
        },
        {
          id: 'skill-local',
          metadata: {
            displayName: {
              en_US: 'Local Skill'
            }
          }
        }
      )
      return of([{ id: 'skill-public' }])
    })

    await component.onAgentStepChange({ selectedIndex: 4 } as any)
    fixture.detectChanges()
    await fixture.whenStable()
    await flushPromises()

    expect(skillRepositoryService.getAllInOrg).toHaveBeenCalled()
    expect(skillPackageService.installRepositoryPackages).toHaveBeenCalledWith('workspace-1', 'repo-public')
    expect(component.selectedRepositoryDefault()).toBeNull()
    expect(component.selectedSkills()).toEqual(['skill-local', 'skill-public'])
    expect(component.selectedMiddlewares()).toEqual([BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER])
  })

  it('treats public workspace skills as explicit selections during claw setup', async () => {
    const { component } = await createComponent(
      {
        category: 'claw',
        type: XpertTypeEnum.Agent
      },
      {
        workspaceSkills: [
          {
            id: 'skill-public',
            metadata: {
              displayName: {
                en_US: 'Public Skill'
              }
            },
            skillIndex: {
              repositoryId: 'repo-public',
              repository: {
                id: 'repo-public',
                provider: 'workspace-public',
                name: 'Workspace Shared Skills'
              }
            }
          }
        ]
      }
    )

    component.toggleSkill('skill-public', true)
    expect(component.selectedRepositoryDefault()).toBeNull()
    expect(component.selectedSkills()).toEqual(['skill-public'])

    component.toggleSkill('skill-public', false)
    expect(component.selectedRepositoryDefault()).toBeNull()
    expect(component.selectedSkills()).toEqual([])
  })

  it('auto-adds and removes skills middleware when skills are toggled', async () => {
    const { component } = await createComponent({
      type: XpertTypeEnum.Agent
    })

    component.selectedMiddlewares.set(['guard'])

    component.toggleSkill('writer', true)
    expect(component.selectedSkills()).toEqual(['writer'])
    expect(component.selectedMiddlewares()).toEqual(['guard', BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER])

    component.toggleSkill('writer', false)
    expect(component.selectedSkills()).toEqual([])
    expect(component.selectedMiddlewares()).toEqual(['guard'])
  })

  it('auto-enables skills middleware after installing a skill', async () => {
    const { component, skillPackageService } = await createComponent(
      {
        type: XpertTypeEnum.Agent,
        workspace: {
          id: 'workspace-1',
          name: 'Workspace One'
        } as any
      },
      {
        installedSkillPackage: {
          id: 'writer'
        }
      }
    )

    await component.installSkill({ id: 'index-writer' } as any)

    expect(skillPackageService.installPackage).toHaveBeenCalledWith('workspace-1', 'index-writer')
    expect(component.selectedSkills()).toEqual(['writer'])
    expect(component.selectedMiddlewares()).toEqual([BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER])
  })

  it('preserves non-skill middlewares when the workspace changes', async () => {
    const { component, fixture } = await createComponent({
      allowWorkspaceSelection: true,
      type: XpertTypeEnum.Agent
    })

    component.selectedExplicitSkills.set(['writer'])
    component.selectedRepositoryDefault.set({
      repositoryId: 'repo-public',
      disabledSkillIds: []
    })
    component.selectedMiddlewares.set(['guard', 'todoListMiddleware', BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER])

    component.workspaceId.set('workspace-2')
    fixture.detectChanges()
    await fixture.whenStable()
    await flushPromises()

    expect(component.selectedSkills()).toEqual([])
    expect(component.selectedRepositoryDefault()).toBeNull()
    expect(component.selectedMiddlewares()).toEqual(['guard', 'todoListMiddleware'])
  })

  it('hides skills middleware from the middleware picker options', async () => {
    const { component } = await createComponent(
      {
        type: XpertTypeEnum.Agent
      },
      {
        middlewareProviders: [
          {
            meta: {
              name: 'guard',
              label: {
                en_US: 'Guard'
              }
            }
          },
          {
            meta: {
              name: BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER,
              label: {
                en_US: 'Skills Middleware'
              }
            }
          }
        ]
      }
    )

    expect(component.middlewareProviderOptions().map((provider) => provider.meta.name)).toEqual(['guard'])
  })

  it('auto-enables required middleware features when creating a blank xpert', async () => {
    const createdXpert = createAgentXpert('created-xpert')
    const { component, fixture, xpertService } = await createComponent(
      {
        completionMode: 'create',
        type: XpertTypeEnum.Agent
      },
      {
        createdXpert,
        middlewareProviders: [
          {
            meta: {
              name: 'FileMemorySystemMiddleware',
              label: {
                en_US: 'File Memory System'
              },
              features: ['sandbox']
            }
          }
        ]
      }
    )

    component.selectedMiddlewares.set(['FileMemorySystemMiddleware'])

    await component.create()
    await fixture.whenStable()
    await flushPromises()

    expect(xpertService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        features: {
          sandbox: {
            enabled: true
          }
        }
      })
    )

    const savedDraft = xpertService.saveDraft.mock.calls[0][1]
    expect(savedDraft.team.features).toEqual({
      sandbox: {
        enabled: true
      }
    })
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

    await component.create()
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
        releaseNotes: 'Initial Xpert bootstrap release.'
      })
    )
    expect(dialogRef.close).toHaveBeenCalledWith({
      xpert: publishedXpert,
      status: 'published'
    })
  })

  it('persists a draft for create mode blank agents before closing', async () => {
    const createdXpert = createAgentXpert('created-xpert')
    const { component, dialogRef, fixture, xpertService } = await createComponent(
      {
        completionMode: 'create',
        type: XpertTypeEnum.Agent
      },
      {
        createdXpert
      }
    )

    await component.create()
    await fixture.whenStable()
    await flushPromises()

    expect(xpertService.create).toHaveBeenCalled()
    expect(xpertService.saveDraft).toHaveBeenCalled()
    expect(xpertService.publish).not.toHaveBeenCalled()
    expect(dialogRef.close).toHaveBeenCalledWith({
      xpert: {
        ...createdXpert,
        draft: {
          checklist: []
        }
      },
      status: 'created'
    })
  })

  it('seeds a claw blank agent prompt with sys soul and profile placeholders', async () => {
    const createdXpert = createAgentXpert('created-xpert')
    const { component, fixture, xpertService } = await createComponent(
      {
        category: 'claw',
        completionMode: 'create',
        type: XpertTypeEnum.Agent
      },
      {
        createdXpert
      }
    )
    const expectedPrompt = buildExpectedClawPrompt('Support workspace members with high-signal help.')

    component.description.set('Support workspace members with high-signal help.')
    await component.create()
    await fixture.whenStable()
    await flushPromises()

    expect(xpertService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: expect.objectContaining({
          prompt: expectedPrompt
        })
      })
    )

    const savedDraft = xpertService.saveDraft.mock.calls[0][1]
    expect(savedDraft.team.agent.prompt).toBe(expectedPrompt)
    expect(savedDraft.nodes.find((node: any) => node.type === 'agent')?.entity?.prompt).toBe(expectedPrompt)
  })

  it('normalizes claw dialog categories before seeding the blank agent prompt', async () => {
    const createdXpert = createAgentXpert('created-xpert')
    const { component, fixture, xpertService } = await createComponent(
      {
        category: ' ClAw ' as any,
        completionMode: 'create',
        type: XpertTypeEnum.Agent
      },
      {
        createdXpert
      }
    )
    const expectedPrompt = buildExpectedClawPrompt('Support workspace members with high-signal help.')

    component.description.set('Support workspace members with high-signal help.')
    await component.create()
    await fixture.whenStable()
    await flushPromises()

    expect(xpertService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: expect.objectContaining({
          prompt: expectedPrompt
        })
      })
    )
  })

  it('keeps the default blank agent prompt unchanged outside claw setup', async () => {
    const createdXpert = createAgentXpert('created-xpert')
    const { component, fixture, xpertService } = await createComponent(
      {
        completionMode: 'create',
        type: XpertTypeEnum.Agent
      },
      {
        createdXpert
      }
    )

    component.description.set('Support workspace members with high-signal help.')
    await component.create()
    await fixture.whenStable()
    await flushPromises()

    expect(xpertService.create.mock.calls[0][0].agent.prompt).toBeUndefined()
    expect(xpertService.saveDraft.mock.calls[0][1].team.agent.prompt).toBeUndefined()
  })

  it('seeds a claw template agent prompt with sys soul and profile placeholders', async () => {
    const importedXpert = createAgentXpert('imported-xpert')
    const { component, dialogRef, fixture, xpertService } = await createComponent(
      {
        category: 'claw',
        completionMode: 'create',
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
            type: XpertTypeEnum.Agent
          }
        ],
        importedXpert
      }
    )
    const expectedPrompt = buildExpectedClawPrompt('Template agent description')

    component.setStartMode('template')
    component.selectedTemplateId.set('template-agent')
    fixture.detectChanges()
    await fixture.whenStable()
    await flushPromises()

    await component.create()
    await fixture.whenStable()
    await flushPromises()

    expect(xpertService.importDSL).toHaveBeenCalledWith(
      expect.objectContaining({
        team: expect.objectContaining({
          agent: expect.not.objectContaining({
            prompt: expect.anything()
          })
        }),
        nodes: expect.arrayContaining([
          expect.objectContaining({
            type: 'agent',
            key: 'Agent_primary',
            entity: expect.objectContaining({
              prompt: expectedPrompt
            })
          })
        ])
      })
    )

    expect(dialogRef.close).toHaveBeenCalledWith({
      xpert: expect.objectContaining({
        agent: expect.objectContaining({
          prompt: expectedPrompt
        })
      }),
      status: 'created'
    })
  })

  it('seeds selected middleware model options from the chosen primary model before saving the draft', async () => {
    const createdXpert = createAgentXpert('created-xpert')
    const { component, fixture, xpertService } = await createComponent(
      {
        completionMode: 'create',
        type: XpertTypeEnum.Agent
      },
      {
        createdXpert,
        middlewareProviders: [
          {
            meta: {
              name: 'SummarizationMiddleware',
              label: {
                en_US: 'Summarization Middleware'
              },
              configSchema: {
                type: 'object',
                properties: {
                  model: {
                    type: 'object',
                    'x-ui': {
                      component: 'ai-model-select',
                      inputs: {
                        modelType: AiModelTypeEnum.LLM
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    )

    component.copilotModel.set({
      copilotId: 'copilot-qwen',
      modelType: AiModelTypeEnum.LLM,
      model: 'qwen3.6-plus'
    } as any)
    component.selectedMiddlewares.set(['SummarizationMiddleware'])

    await component.create()
    await fixture.whenStable()
    await flushPromises()

    const savedDraft = xpertService.saveDraft.mock.calls[0][1]
    const middlewareNode = savedDraft.nodes.find(
      (node: any) => node.type === 'workflow' && node.entity?.provider === 'SummarizationMiddleware'
    )

    expect(middlewareNode.entity.options.model).toEqual({
      copilotId: 'copilot-qwen',
      modelType: AiModelTypeEnum.LLM,
      model: 'qwen3.6-plus'
    })
  })

  it('seeds template middleware model options from the primary agent model before importing', async () => {
    const { component, fixture, xpertService } = await createComponent(
      {
        completionMode: 'create',
        type: XpertTypeEnum.Agent
      },
      {
        agentTemplateDetail: {
          export_data: createAgentTemplateYamlWithPrimaryAgentModelOnly()
        },
        agentTemplates: [
          {
            id: 'template-agent',
            name: 'template-agent',
            title: 'Template Agent',
            description: 'Template agent description',
            category: 'Agent',
            type: XpertTypeEnum.Agent
          }
        ],
        middlewareProviders: [
          {
            meta: {
              name: 'SummarizationMiddleware',
              label: {
                en_US: 'Summarization Middleware'
              },
              configSchema: {
                type: 'object',
                properties: {
                  model: {
                    type: 'object',
                    'x-ui': {
                      component: 'ai-model-select',
                      inputs: {
                        modelType: AiModelTypeEnum.LLM
                      }
                    }
                  }
                }
              }
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

    expect(component.copilotModel()).toEqual({
      copilotId: 'copilot-glm',
      modelType: AiModelTypeEnum.LLM,
      model: 'glm-5'
    })

    await component.create()
    await fixture.whenStable()
    await flushPromises()

    const importedDraft = xpertService.importDSL.mock.calls[0][0]
    const middlewareNode = importedDraft.nodes.find(
      (node: any) => node.type === 'workflow' && node.entity?.provider === 'SummarizationMiddleware'
    )

    expect(importedDraft.team.copilotModel).toEqual({
      copilotId: 'copilot-glm',
      modelType: AiModelTypeEnum.LLM,
      model: 'glm-5'
    })
    expect(middlewareNode.entity.options.model).toEqual({
      copilotId: 'copilot-glm',
      modelType: AiModelTypeEnum.LLM,
      model: 'glm-5'
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

    await component.create()
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
        releaseNotes: 'Initial Xpert bootstrap release.'
      })
    )
    expect(dialogRef.close).toHaveBeenCalledWith({
      xpert: publishedXpert,
      status: 'published'
    })
  })

  it('auto-enables required middleware features when importing a template', async () => {
    const importedXpert = createAgentXpert('imported-xpert')
    const { component, fixture, xpertService } = await createComponent(
      {
        completionMode: 'create',
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
            type: XpertTypeEnum.Agent
          }
        ],
        importedXpert,
        middlewareProviders: [
          {
            meta: {
              name: 'guard',
              label: {
                en_US: 'Guard'
              },
              features: ['sandbox']
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

    await component.create()
    await fixture.whenStable()
    await flushPromises()

    expect(xpertService.importDSL).toHaveBeenCalledWith(
      expect.objectContaining({
        team: expect.objectContaining({
          features: {
            sandbox: {
              enabled: true
            }
          }
        })
      })
    )
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

    await component.create()
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
