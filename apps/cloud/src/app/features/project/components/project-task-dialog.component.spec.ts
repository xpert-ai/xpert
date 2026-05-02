import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import {
  createProjectId,
  createSprintId,
  createTeamId,
  createXpertId,
  IProjectTask,
  IProjectTaskExecutionArtifact,
  ProjectAgentRole,
  ProjectExecutionEnvironmentType,
  ProjectSprintStrategyEnum,
  ProjectSwimlaneKindEnum,
  ProjectTaskExecutionArtifactTypeEnum,
  ProjectTaskExecutionStatusEnum,
  ProjectTaskStatusEnum
} from '@xpert-ai/contracts'
import { ToastrService } from '../../../@core/services/toastr.service'
import { ProjectTaskService } from '../../../@core/services/project-task.service'
import { ProjectTaskArtifactDialogComponent } from './project-task-artifact-dialog.component'

jest.mock('./project-task-conversation-dialog.component', () => {
  class ProjectTaskConversationDialogComponent {}

  const getLatestTaskConversationId = (task?: { latestExecution?: { conversationId?: string | null } } | null) =>
    task?.latestExecution?.conversationId?.trim() || ''

  return {
    ProjectTaskConversationDialogComponent,
    getLatestTaskConversationId,
    openProjectTaskConversationDialog: jest.fn(
      (
        dialog: { open: (component: unknown, options: unknown) => unknown },
        task?: { latestExecution?: { conversationId?: string | null }; organizationId?: string | null; title?: string }
      ) => {
        const conversationId = getLatestTaskConversationId(task)
        if (!conversationId) {
          return null
        }

        return dialog.open(ProjectTaskConversationDialogComponent, {
          backdropClass: 'xp-overlay-share-sheet',
          panelClass: 'xp-overlay-pane-share-sheet',
          data: {
            conversationId,
            organizationId: task?.organizationId ?? null,
            taskTitle: task?.title ?? null
          }
        })
      }
    )
  }
})

import { ProjectTaskConversationDialogComponent } from './project-task-conversation-dialog.component'
import { ProjectTaskDialogComponent } from './project-task-dialog.component'

describe('ProjectTaskDialogComponent', () => {
  function createComponent(options?: { boundTeams?: unknown[]; task?: IProjectTask | null }) {
    TestBed.resetTestingModule()

    const dialogRef = { close: jest.fn() }
    const taskService = {
      create: jest.fn(),
      update: jest.fn()
    }
    const toastr = {
      error: jest.fn()
    }
    const dialog = {
      open: jest.fn()
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
            boundTeams: options?.boundTeams ?? [],
            task: options?.task ?? null
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
        },
        {
          provide: Dialog,
          useValue: dialog
        }
      ]
    })

    const component = TestBed.runInInjectionContext(() => new ProjectTaskDialogComponent())

    return {
      component,
      dialogRef,
      taskService,
      toastr,
      dialog
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

  it('opens the latest task execution conversation in a dialog', () => {
    const task: IProjectTask = {
      id: 'task-1',
      projectId: createProjectId('project-1'),
      sprintId: createSprintId('sprint-1'),
      swimlaneId: 'lane-coding',
      title: 'Existing task',
      sortOrder: 0,
      status: ProjectTaskStatusEnum.Failed,
      dependencies: [],
      latestExecution: {
        id: 'execution-1',
        projectId: createProjectId('project-1'),
        sprintId: createSprintId('sprint-1'),
        taskId: 'task-1',
        teamId: createTeamId('team-1'),
        xpertId: createXpertId('xpert-1'),
        dispatchId: 'dispatch-1',
        status: ProjectTaskExecutionStatusEnum.Success,
        conversationId: 'conversation-1'
      }
    }
    const { component, dialog } = createComponent({ task })

    component.openLatestConversation()

    expect(dialog.open).toHaveBeenCalledWith(
      ProjectTaskConversationDialogComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'conversation-1',
          taskTitle: 'Existing task'
        })
      })
    )
  })

  it('opens task artifacts from the artifacts tab content', () => {
    const artifact = {
      type: ProjectTaskExecutionArtifactTypeEnum.ProjectFile,
      name: 'Result brief',
      path: 'deliverables/task-1/result.md'
    } satisfies IProjectTaskExecutionArtifact
    const task: IProjectTask = {
      id: 'task-1',
      projectId: createProjectId('project-1'),
      sprintId: createSprintId('sprint-1'),
      swimlaneId: 'lane-coding',
      title: 'Existing task',
      sortOrder: 0,
      status: ProjectTaskStatusEnum.Done,
      dependencies: [],
      latestExecution: {
        id: 'execution-1',
        projectId: createProjectId('project-1'),
        sprintId: createSprintId('sprint-1'),
        taskId: 'task-1',
        teamId: createTeamId('team-1'),
        xpertId: createXpertId('xpert-1'),
        dispatchId: 'dispatch-1',
        status: ProjectTaskExecutionStatusEnum.Success,
        artifacts: [artifact]
      }
    }
    const { component, dialog } = createComponent({ task })
    const event = { stopPropagation: jest.fn() } as unknown as Event

    expect(component.artifacts()).toEqual([artifact])

    component.openArtifact(event, artifact)

    expect(event.stopPropagation).toHaveBeenCalled()
    expect(dialog.open).toHaveBeenCalledWith(
      ProjectTaskArtifactDialogComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: createProjectId('project-1'),
          artifact,
          taskTitle: 'Existing task'
        })
      })
    )
  })
})
