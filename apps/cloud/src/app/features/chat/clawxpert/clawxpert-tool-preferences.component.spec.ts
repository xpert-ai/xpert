import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { concat, NEVER, of, throwError } from 'rxjs'
import {
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

function createFacadeMock() {
  return {
    loadingTriggerDraft: signal(false),
    organizationId: signal('org-1'),
    resolvedPreference: signal({ assistantId: 'xpert-1' }),
    setToolEnabled: jest.fn().mockResolvedValue(true),
    toolPreferences: signal({ version: 1 }),
    triggerDraft: signal(createDraft()),
    triggerDraftErrorMessage: signal<string | null>(null),
    viewState: signal<'ready'>('ready'),
    xpertId: signal('xpert-1'),
    isToolEnabled: jest.fn((sourceType: string, _nodeKey: string, toolName: string) =>
      sourceType === 'toolset' ? toolName !== 'tavily_search' : true
    )
  }
}

describe('ClawXpertToolPreferencesComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('switches tabs, filters out xpert-disabled tools, and delegates toggles to the facade', async () => {
    const facade = createFacadeMock()
    const toolsetService = {
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
            },
            {
              name: 'delete_scheduler',
              description: 'Delete scheduled tasks'
            }
          ]
        })
      )
    }

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertToolPreferencesComponent],
      providers: [
        {
          provide: ClawXpertFacade,
          useValue: facade
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

    expect(toolsetService.getOneById).toHaveBeenCalledWith('toolset-1', { relations: ['tools'] })
    expect(agentService.getAgentMiddleware).toHaveBeenCalledWith('scheduler', {})
    expect(component.toolItems()).toHaveLength(2)
    expect(fixture.nativeElement.textContent).toContain('2 tools')
    expect(fixture.nativeElement.textContent).toContain('Search the web')
    expect(fixture.nativeElement.textContent).toContain('Create scheduled tasks')
    expect(fixture.nativeElement.textContent).not.toContain('Should not be listed')
    expect(fixture.nativeElement.textContent).not.toContain('Delete scheduled tasks')

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]
    const skillTab = buttons.find((button) =>
      button.textContent?.includes('Skill')
    ) as HTMLButtonElement
    skillTab.click()
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('Workspace skills are coming soon')

    await component.toggleTool(component.toolItems()[0], true)

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

  it('renders per-source load errors without hiding tools from other sources', async () => {
    const facade = createFacadeMock()
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

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertToolPreferencesComponent],
      providers: [
        {
          provide: ClawXpertFacade,
          useValue: facade
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

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('toolset failed')
    expect(fixture.nativeElement.textContent).toContain('Create scheduled tasks')
  })
})
