import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import {
  ProjectAgentRole,
  ProjectExecutionEnvironmentType,
  ProjectSprintStatusEnum,
  ProjectSprintStrategyEnum,
  ProjectSwimlaneKindEnum
} from '@xpert-ai/contracts'
import { of } from 'rxjs'
import { ToastrService } from '../../../@core/services/toastr.service'
import { ProjectSprintService } from '../../../@core/services/project-sprint.service'
import { ProjectSwimlaneService } from '../../../@core/services/project-swimlane.service'
import { ProjectTaskService } from '../../../@core/services/project-task.service'
import { ProjectSprintCreateDialogComponent } from './project-sprint-create-dialog.component'

describe('ProjectSprintCreateDialogComponent', () => {
  function createComponent() {
    TestBed.resetTestingModule()

    const dialogRef = { close: jest.fn() }
    const sprintService = {
      create: jest.fn().mockReturnValue(
        of({
          id: 'sprint-2',
          projectId: 'project-1',
          goal: 'Next sprint',
          status: ProjectSprintStatusEnum.Planned,
          strategyType: ProjectSprintStrategyEnum.SoftwareDelivery
        })
      )
    }
    const swimlaneService = {
      listBySprint: jest.fn().mockReturnValue(
        of({
          items: [
            {
              id: 'lane-backlog-2',
              projectId: 'project-1',
              sprintId: 'sprint-2',
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
            }
          ],
          total: 1
        })
      )
    }
    const taskService = {
      moveTasks: jest.fn().mockReturnValue(of([]))
    }
    const toastr = {
      error: jest.fn(),
      warning: jest.fn()
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
            currentSprint: {
              id: 'sprint-1',
              projectId: 'project-1',
              goal: 'Current sprint',
              status: ProjectSprintStatusEnum.Running,
              strategyType: ProjectSprintStrategyEnum.SoftwareDelivery
            },
            backlogTasks: [
              {
                id: 'task-1',
                projectId: 'project-1',
                sprintId: 'sprint-1',
                swimlaneId: 'lane-backlog-1',
                title: 'Carry me over',
                sortOrder: 0,
                status: 'todo',
                dependencies: []
              }
            ]
          }
        },
        {
          provide: DialogRef,
          useValue: dialogRef
        },
        {
          provide: ProjectSprintService,
          useValue: sprintService
        },
        {
          provide: ProjectSwimlaneService,
          useValue: swimlaneService
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

    const component = TestBed.runInInjectionContext(() => new ProjectSprintCreateDialogComponent())

    return {
      component,
      dialogRef,
      sprintService,
      swimlaneService,
      taskService
    }
  }

  it('creates a sprint and carries selected backlog tasks into the new sprint backlog', async () => {
    const { component, dialogRef, sprintService, swimlaneService, taskService } = createComponent()

    component.form.controls.goal.setValue('Next sprint')
    component.toggleCarryOverTask('task-1')

    await component.submit()

    expect(sprintService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        goal: 'Next sprint',
        strategyType: ProjectSprintStrategyEnum.SoftwareDelivery,
        status: ProjectSprintStatusEnum.Planned
      })
    )
    expect(swimlaneService.listBySprint).toHaveBeenCalledWith('project-1', 'sprint-2')
    expect(taskService.moveTasks).toHaveBeenCalledWith({
      taskIds: ['task-1'],
      targetSwimlaneId: 'lane-backlog-2'
    })
    expect(dialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'sprint-2'
      })
    )
  })
})
