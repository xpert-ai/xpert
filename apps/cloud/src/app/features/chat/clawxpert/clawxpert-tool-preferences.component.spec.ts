import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { ZardDialogService } from '@xpert-ai/headless-ui'
import { concat, NEVER, of, throwError } from 'rxjs'
import {
  ISkillPackage,
  ISkillRepositoryIndex,
  SkillPackageService,
  ToastrService,
  TXpertTeamDraft,
  WorkflowNodeTypeEnum,
  XpertAgentService,
  XpertToolsetService
} from '../../../@core'
import { ClawXpertFacade } from './clawxpert.facade'
import { ClawXpertToolPreferencesComponent } from './clawxpert-tool-preferences.component'

function createDraft(): TXpertTeamDraft {
  return {
    team: {
      id: 'xpert-1'
    },
    nodes: [
      {
        key: 'toolset-node',
        type: 'toolset',
        position: { x: 0, y: 0 },
        entity: {
          id: 'toolset-1',
          name: 'Search'
        }
      },
      {
        key: 'middleware-node',
        type: 'workflow',
        position: { x: 0, y: 120 },
        entity: {
          key: 'middleware-node',
          type: WorkflowNodeTypeEnum.MIDDLEWARE,
          provider: 'scheduler',
          tools: {
            delete_scheduler: {
              enabled: false
            }
          }
        }
      }
    ],
    connections: []
  } as TXpertTeamDraft
}

function createSkillPackage(id = 'skill-package-1', overrides?: Partial<ISkillPackage>): ISkillPackage {
  return {
    id,
    name: 'Workspace Search',
    metadata: {
      displayName: 'Workspace Search',
      summary: 'Workspace skill summary'
    },
    skillIndex: {
      id: 'index-1',
      skillId: 'skill.search',
      name: 'Workspace Search',
      description: 'Workspace skill summary',
      repository: {
        id: 'repository-1',
        name: 'anthropics/skills',
        provider: 'github'
      }
    },
    ...overrides
  } as ISkillPackage
}

function createFacadeMock() {
  return {
    currentWorkspaceId: signal<string | null>('workspace-1'),
    loadingTriggerDraft: signal(false),
    organizationId: signal('org-1'),
    resolvedPreference: signal({ assistantId: 'xpert-1' }),
    setSkillEnabled: jest.fn().mockResolvedValue(true),
    setToolEnabled: jest.fn().mockResolvedValue(true),
    toolPreferences: signal({ version: 1 }),
    triggerDraft: signal(createDraft()),
    triggerDraftErrorMessage: signal<string | null>(null),
    viewState: signal<'ready'>('ready'),
    xpertId: signal('xpert-1'),
    isSkillEnabled: jest.fn(() => true),
    isToolEnabled: jest.fn((sourceType: string, _nodeKey: string, toolName: string) =>
      sourceType === 'toolset' ? toolName !== 'tavily_search' : true
    )
  }
}

async function configureComponent(options?: {
  facade?: ReturnType<typeof createFacadeMock>
  skillPackageService?: {
    getAllByWorkspace: jest.Mock
    installPackage: jest.Mock
  }
  toolsetService?: {
    getOneById: jest.Mock
  }
  agentService?: {
    agentMiddlewares$: ReturnType<typeof of>
    getAgentMiddleware: jest.Mock
  }
  dialog?: {
    open: jest.Mock
  }
}) {
  const facade = options?.facade ?? createFacadeMock()
  const skillPackageService = options?.skillPackageService ?? {
    getAllByWorkspace: jest.fn(() => of({ items: [] })),
    installPackage: jest.fn(() => of({ id: 'installed-skill-package' }))
  }
  const toolsetService = options?.toolsetService ?? {
    getOneById: jest.fn(() =>
      concat(
        of({
          id: 'toolset-1',
          name: 'Search',
          options: {
            toolPositions: {
              tavily_search: 0
            }
          },
          tools: [
            {
              name: 'tavily_search',
              description: 'Search the web'
            },
            {
              name: 'hidden_tool',
              description: 'Should not be listed',
              disabled: true
            }
          ]
        }),
        NEVER
      )
    )
  }
  const agentService = options?.agentService ?? {
    agentMiddlewares$: of([
      {
        meta: {
          name: 'scheduler',
          label: 'Scheduler'
        }
      }
    ]),
    getAgentMiddleware: jest.fn(() =>
      of({
        tools: [
          {
            name: 'create_scheduler',
            description: 'Create scheduled tasks'
          },
          {
            name: 'delete_scheduler',
            description: 'Delete scheduled tasks'
          }
        ]
      })
    )
  }
  const toastr = {
    error: jest.fn()
  }
  const dialog = options?.dialog ?? {
    open: jest.fn(() => ({
      afterClosed: () => of(undefined)
    }))
  }

  TestBed.resetTestingModule()

  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), ClawXpertToolPreferencesComponent],
    providers: [
      {
        provide: ClawXpertFacade,
        useValue: facade
      },
      {
        provide: SkillPackageService,
        useValue: skillPackageService
      },
      {
        provide: ToastrService,
        useValue: toastr
      },
      {
        provide: ZardDialogService,
        useValue: dialog
      },
      {
        provide: XpertToolsetService,
        useValue: toolsetService
      },
      {
        provide: XpertAgentService,
        useValue: agentService
      }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(ClawXpertToolPreferencesComponent)
  const component = fixture.componentInstance

  fixture.detectChanges()
  await fixture.whenStable()
  fixture.detectChanges()

  return {
    facade,
    skillPackageService,
    toolsetService,
    agentService,
    dialog,
    toastr,
    fixture,
    component
  }
}

describe('ClawXpertToolPreferencesComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('switches tabs, loads workspace skills, filters out xpert-disabled tools, and delegates toggles to the facade', async () => {
    const skillPackageService = {
      getAllByWorkspace: jest.fn(() => of({ items: [createSkillPackage()] })),
      installPackage: jest.fn(() => of({ id: 'installed-skill-package' }))
    }

    const { agentService, component, facade, fixture, toolsetService } = await configureComponent({
      skillPackageService
    })

    expect(toolsetService.getOneById).toHaveBeenCalledWith('toolset-1', { relations: ['tools'] })
    expect(agentService.getAgentMiddleware).toHaveBeenCalledWith('scheduler', {})
    expect(component.toolItems()).toHaveLength(2)
    expect(fixture.nativeElement.textContent).toContain('2 tools')
    expect(fixture.nativeElement.textContent).toContain('Search the web')
    expect(fixture.nativeElement.textContent).toContain('Create scheduled tasks')
    expect(fixture.nativeElement.textContent).not.toContain('Should not be listed')
    expect(fixture.nativeElement.textContent).not.toContain('Delete scheduled tasks')

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]
    const skillTab = buttons.find((button) => button.textContent?.includes('Skill')) as HTMLButtonElement
    skillTab.click()
    fixture.detectChanges()

    expect(skillPackageService.getAllByWorkspace).toHaveBeenCalledWith('workspace-1', {
      relations: ['skillIndex', 'skillIndex.repository']
    })
    expect(component.skillItems()).toHaveLength(1)
    expect(fixture.nativeElement.textContent).toContain('Workspace Search')
    expect(fixture.nativeElement.textContent).toContain('Workspace skill summary')
    expect(fixture.nativeElement.textContent).toContain('anthropics/skills')
    expect(fixture.nativeElement.textContent).toContain('github')

    await component.toggleSkill(component.skillItems()[0], false)
    await component.toggleTool(component.toolItems()[0], true)

    expect(facade.setSkillEnabled).toHaveBeenCalledWith('workspace-1', 'skill-package-1', false)
    expect(facade.setToolEnabled).toHaveBeenCalledWith(
      'toolset',
      'toolset-node',
      {
        toolsetId: 'toolset-1',
        toolsetName: 'Search'
      },
      'tavily_search',
      true
    )
  })

  it('opens the install dialog from the skills tab and installs the returned skill package', async () => {
    const skillPackageService = {
      getAllByWorkspace: jest
        .fn()
        .mockReturnValueOnce(of({ items: [] }))
        .mockReturnValueOnce(
          of({
            items: [
              createSkillPackage('skill-package-2', {
                name: 'Installed Skill',
                metadata: {
                  displayName: 'Installed Skill',
                  summary: 'Freshly installed'
                },
                skillIndex: {
                  id: 'index-2',
                  skillId: 'skill.installed',
                  name: 'Installed Skill',
                  description: 'Freshly installed',
                  repository: {
                    id: 'repository-1',
                    name: 'anthropics/skills',
                    provider: 'github'
                  }
                }
              })
            ]
          })
        ),
      installPackage: jest.fn(() => of({ id: 'skill-package-2' }))
    }
    const dialog = {
      open: jest.fn(() => ({
        afterClosed: () =>
          of({
            kind: 'repository-index',
            skillIndex: { id: 'index-2' } as ISkillRepositoryIndex
          })
      }))
    }

    const { component, fixture } = await configureComponent({
      skillPackageService,
      dialog
    })

    component.selectTab('skills')
    fixture.detectChanges()

    expect(component.skillItems()).toHaveLength(0)

    component.openSkillInstallDialog()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(dialog.open).toHaveBeenCalled()
    expect(skillPackageService.installPackage).toHaveBeenCalledWith('workspace-1', 'index-2')
    expect(skillPackageService.getAllByWorkspace).toHaveBeenCalledTimes(2)
    expect(component.skillItems()).toHaveLength(1)
    expect(fixture.nativeElement.textContent).toContain('Installed Skill')
  })

  it('shows a workspace-required empty state when the bound xpert has no workspace yet', async () => {
    const facade = createFacadeMock()
    facade.currentWorkspaceId.set(null)
    const skillPackageService = {
      getAllByWorkspace: jest.fn(() => of({ items: [createSkillPackage()] })),
      installPackage: jest.fn(() => of({ id: 'installed-skill-package' }))
    }

    const { component, fixture } = await configureComponent({
      facade,
      skillPackageService
    })

    component.selectTab('skills')
    fixture.detectChanges()

    expect(skillPackageService.getAllByWorkspace).not.toHaveBeenCalled()
    expect(fixture.nativeElement.textContent).toContain('This ClawXpert is not attached to a workspace yet')
  })

  it('shows workspace skill load errors inside the skills tab', async () => {
    const skillPackageService = {
      getAllByWorkspace: jest.fn(() => throwError(() => new Error('skills failed'))),
      installPackage: jest.fn(() => of({ id: 'installed-skill-package' }))
    }

    const { component, fixture } = await configureComponent({
      skillPackageService
    })

    component.selectTab('skills')
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('Failed to load workspace skills')
    expect(fixture.nativeElement.textContent).toContain('skills failed')
  })

  it('renders per-source load errors without hiding tools from other sources', async () => {
    const toolsetService = {
      getOneById: jest.fn(() => throwError(() => new Error('toolset failed')))
    }
    const agentService = {
      agentMiddlewares$: of([
        {
          meta: {
            name: 'scheduler',
            label: 'Scheduler'
          }
        }
      ]),
      getAgentMiddleware: jest.fn(() =>
        of({
          tools: [
            {
              name: 'create_scheduler',
              description: 'Create scheduled tasks'
            }
          ]
        })
      )
    }

    const { fixture } = await configureComponent({
      toolsetService,
      agentService
    })

    expect(fixture.nativeElement.textContent).toContain('toolset failed')
    expect(fixture.nativeElement.textContent).toContain('Create scheduled tasks')
  })
})
