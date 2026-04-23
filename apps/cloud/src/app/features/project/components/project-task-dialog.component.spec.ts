import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import {
  ProjectAgentRole,
  ProjectExecutionEnvironmentType,
  ProjectSprintStrategyEnum,
  ProjectSwimlaneKindEnum,
  ProjectTaskStatusEnum
} from '@xpert-ai/contracts'
import { ToastrService } from '../../../@core/services/toastr.service'
import { ProjectTaskService } from '../../../@core/services/project-task.service'
import { ProjectTaskDialogComponent } from './project-task-dialog.component'

describe('ProjectTaskDialogComponent', () => {
  function createComponent(options?: { boundTeams?: unknown[] }) {
    TestBed.resetTestingModule()

    const dialogRef = { close: jest.fn() }
    const taskService = {
      create: jest.fn(),
      update: jest.fn()
    }
    const toastr = {
      error: jest.fn()
    }

    TestBed.configureTestingModule({
      providers: [
        {
          provide: DIALOG_DATA,
          useValue: {
            project: {
              id: 'project-1',
              name: 'Project',
              goal: 'Goal',
              mainAssistantId: 'assistant-1',
              status: 'active'
            },
            sprint: {
              id: 'sprint-1',
              projectId: 'project-1',
              goal: 'Sprint Goal',
              status: 'running',
              strategyType: ProjectSprintStrategyEnum.SoftwareDelivery
            },
            swimlanes: [
              {
                id: 'lane-backlog',
                projectId: 'project-1',
                sprintId: 'sprint-1',
                key: 'backlog',
                name: 'Backlog',
                kind: ProjectSwimlaneKindEnum.Backlog,
                priority: 0,
                weight: 0,
                concurrencyLimit: 0,
                wipLimit: 0,
                agentRole: ProjectAgentRole.Planner,
                environmentType: ProjectExecutionEnvironmentType.Browser,
                sortOrder: 0,
                sourceStrategyType: ProjectSprintStrategyEnum.SoftwareDelivery
              },
              {
                id: 'lane-coding',
                projectId: 'project-1',
                sprintId: 'sprint-1',
                key: 'coding',
                name: 'Coding',
                kind: ProjectSwimlaneKindEnum.Execution,
                priority: 1,
                weight: 1,
                concurrencyLimit: 2,
                wipLimit: 2,
                agentRole: ProjectAgentRole.Coder,
                environmentType: ProjectExecutionEnvironmentType.Container,
                sortOrder: 1,
                sourceStrategyType: ProjectSprintStrategyEnum.SoftwareDelivery
              }
            ],
            tasks: [
              {
                id: 'task-1',
                projectId: 'project-1',
                sprintId: 'sprint-1',
                swimlaneId: 'lane-coding',
                title: 'Existing task',
                sortOrder: 0,
                status: ProjectTaskStatusEnum.Doing,
                dependencies: []
              },
              {
                id: 'task-2',
                projectId: 'project-1',
                sprintId: 'sprint-1',
                swimlaneId: 'lane-coding',
                title: 'Dependency task',
                sortOrder: 1,
                status: ProjectTaskStatusEnum.Todo,
                dependencies: []
              }
            ],
            boundTeams: options?.boundTeams ?? []
          }
        },
        {
          provide: DialogRef,
          useValue: dialogRef
        },
        {
          provide: ProjectTaskService,
          useValue: taskService
        },
        {
          provide: ToastrService,
          useValue: toastr
        }
      ]
    })

    const component = TestBed.runInInjectionContext(() => new ProjectTaskDialogComponent())

    return {
      component,
      dialogRef,
      taskService,
      toastr
    }
  }

  it('clears dependencies and forces todo when the backlog swimlane is selected', async () => {
    const { component } = createComponent()

    component.form.controls.status.setValue(ProjectTaskStatusEnum.Done)
    component.form.controls.dependencies.setValue(['task-2'])
    component.form.controls.swimlaneId.setValue('lane-backlog')
    await Promise.resolve()

    expect(component.isBacklogLane()).toBeTruthy()
    expect(component.form.controls.status.value).toBe(ProjectTaskStatusEnum.Todo)
    expect(component.form.controls.dependencies.value).toEqual([])
  })

  it('keeps team routing disabled when the project has no bound teams', () => {
    const { component } = createComponent({ boundTeams: [] })

    expect(component.hasTeams()).toBeFalsy()
    expect(component.form.controls.teamId.value).toBe('')
  })
})
