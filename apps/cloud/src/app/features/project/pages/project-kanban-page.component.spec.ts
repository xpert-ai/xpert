import { BreakpointObserver } from '@angular/cdk/layout'
import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, NO_ERRORS_SCHEMA, Output, Pipe, PipeTransform, computed, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { of } from 'rxjs'
import {
  createProjectId,
  createSprintId,
  IProjectCore,
  IProjectSprint,
  ProjectCoreStatusEnum,
  ProjectSprintStatusEnum,
  ProjectSprintStrategyEnum
} from '@xpert-ai/contracts'
import { ProjectPageFacade } from '../project-page.facade'
import { ProjectShellComponent } from '../project-shell.component'
import { ProjectKanbanPageComponent } from './project-kanban-page.component'

@Pipe({
  standalone: true,
  name: 'translate'
})
class TranslateStubPipe implements PipeTransform {
  transform(value: string, options?: { Default?: string }) {
    return options?.Default ?? value
  }
}

@Component({
  standalone: true,
  selector: 'xp-project-assistant-panel',
  template: ''
})
class ProjectAssistantPanelStubComponent {
  @Input() project?: IProjectCore | null
  @Input() loading?: boolean
  @Output() bindRequested = new EventEmitter<void>()
  @Output() projectDataRefreshRequested = new EventEmitter<void>()
}

describe('ProjectKanbanPageComponent', () => {
  let debugSpy: jest.SpyInstance

  beforeEach(() => {
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined)
  })

  afterEach(() => {
    debugSpy.mockRestore()
  })

  function createComponent() {
    const projectId = createProjectId('project-1')
    const sprintId = createSprintId('sprint-1')
    const project: IProjectCore = {
      id: projectId,
      name: 'Project Alpha',
      goal: 'Ship project shell',
      mainAssistantId: null,
      status: ProjectCoreStatusEnum.Active
    }
    const sprint: IProjectSprint = {
      id: sprintId,
      projectId,
      goal: 'Current sprint',
      status: ProjectSprintStatusEnum.Running,
      strategyType: ProjectSprintStrategyEnum.SoftwareDelivery
    }
    const selectedProject = signal<IProjectCore | null>(project)
    const selectedSprint = signal<IProjectSprint | null>(sprint)
    const facade = {
      selectedProject,
      selectedSprint,
      selectedSprintId: signal(sprintId),
      sprints: signal<IProjectSprint[]>([sprint]),
      selectedLaneCount: signal(1),
      selectedTaskCount: signal(2),
      selectedTeamCount: signal(0),
      hasSprint: computed(() => !!selectedSprint()),
      boardColumns: signal([]),
      hasTasks: signal(false),
      boardLoading: signal(false),
      teamNameById: signal(new Map<string, string>()),
      loading: signal(false),
      tasks: signal([]),
      selectSprint: jest.fn().mockResolvedValue(undefined),
      moveTask: jest.fn().mockResolvedValue(undefined),
      updateTaskStatus: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn().mockResolvedValue(undefined)
    }
    const shell = {
      openBindMainAgent: jest.fn().mockResolvedValue(undefined),
      openCreateSprint: jest.fn().mockResolvedValue(undefined),
      openTaskDialog: jest.fn().mockResolvedValue(undefined)
    }

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      imports: [ProjectKanbanPageComponent],
      providers: [
        {
          provide: ProjectPageFacade,
          useValue: facade
        },
        {
          provide: ProjectShellComponent,
          useValue: shell
        },
        {
          provide: BreakpointObserver,
          useValue: {
            observe: jest.fn(() => of({ matches: true }))
          }
        }
      ]
    })
    TestBed.overrideComponent(ProjectKanbanPageComponent, {
      set: {
        imports: [CommonModule, TranslateStubPipe, ProjectAssistantPanelStubComponent],
        schemas: [NO_ERRORS_SCHEMA]
      }
    })

    const fixture = TestBed.createComponent(ProjectKanbanPageComponent)
    fixture.detectChanges()

    return {
      fixture,
      facade,
      shell,
      project
    }
  }

  it('renders the project assistant rail in the Kanban page and wires project actions', () => {
    const { fixture, facade, shell, project } = createComponent()
    const assistantPanel = fixture.debugElement.query(By.directive(ProjectAssistantPanelStubComponent))
    const assistant = assistantPanel.componentInstance as ProjectAssistantPanelStubComponent

    expect(assistant.project).toBe(project)
    expect(assistant.loading).toBe(false)

    assistant.bindRequested.emit()
    expect(shell.openBindMainAgent).toHaveBeenCalledWith(project)

    assistant.projectDataRefreshRequested.emit()
    expect(facade.refresh).toHaveBeenCalled()
  })
})
