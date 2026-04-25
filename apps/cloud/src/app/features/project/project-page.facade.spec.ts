import { TestBed } from '@angular/core/testing'
import { convertToParamMap, ActivatedRoute, Router } from '@angular/router'
import {
  ProjectAgentRole,
  ProjectExecutionEnvironmentType,
  ProjectSprintStatusEnum,
  ProjectSprintStrategyEnum,
  ProjectSwimlaneKindEnum,
  ProjectTaskStatusEnum
} from '@xpert-ai/contracts'
import { BehaviorSubject, of } from 'rxjs'
import { ToastrService } from '../../@core/services/toastr.service'
import { ProjectCoreService } from '../../@core/services/project-core.service'
import { ProjectSprintService } from '../../@core/services/project-sprint.service'
import { ProjectSwimlaneService } from '../../@core/services/project-swimlane.service'
import { ProjectTaskService } from '../../@core/services/project-task.service'
import { TeamBindingService } from '../../@core/services/team-binding.service'
import { TeamDefinitionService } from '../../@core/services/team-definition.service'
import { ProjectPageFacade } from './project-page.facade'

describe('ProjectPageFacade', () => {
  async function createFacade(query?: Record<string, string>, options?: { projectId?: string | null; childPath?: string }) {
    TestBed.resetTestingModule()

    const projectId = options?.projectId === undefined ? 'project-1' : options.projectId
    const paramMap$ = new BehaviorSubject(convertToParamMap(projectId ? { projectId } : {}))
    const queryParamMap$ = new BehaviorSubject(convertToParamMap(query ?? {}))
    const childPath = options?.childPath ?? 'kanban'
    const router = {
      navigate: jest.fn().mockResolvedValue(true)
    }
    const projectCoreService = {
      list: jest.fn().mockReturnValue(
        of({
          items: [
            {
              id: 'project-1',
              name: 'Project',
              goal: 'Goal',
              mainAssistantId: 'assistant-1',
              status: 'active'
            }
          ],
          total: 1
        })
      )
    }
    const projectSprintService = {
      listByProject: jest.fn().mockReturnValue(
        of({
          items: [
            {
              id: 'sprint-running',
              projectId: 'project-1',
              goal: 'Running sprint',
              status: ProjectSprintStatusEnum.Running,
              strategyType: ProjectSprintStrategyEnum.SoftwareDelivery,
              updatedAt: new Date('2026-04-18T10:00:00.000Z')
            },
            {
              id: 'sprint-planned',
              projectId: 'project-1',
              goal: 'Planned sprint',
              status: ProjectSprintStatusEnum.Planned,
              strategyType: ProjectSprintStrategyEnum.SoftwareDelivery,
              updatedAt: new Date('2026-04-18T08:00:00.000Z')
            }
          ],
          total: 2
        })
      )
    }
    const projectSwimlaneService = {
      listBySprint: jest.fn().mockImplementation((_projectId: string, sprintId: string) =>
        of({
          items: [
            {
              id: 'lane-backlog',
              projectId: 'project-1',
              sprintId,
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
              sprintId,
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
          total: 2
        })
      )
    }
    const projectTaskService = {
      listBySprint: jest.fn().mockImplementation((_projectId: string, sprintId: string) =>
        of({
          items: [
            {
              id: 'task-1',
              projectId: 'project-1',
              sprintId,
              swimlaneId: 'lane-coding',
              title: 'First task',
              sortOrder: 0,
              status: ProjectTaskStatusEnum.Todo,
              dependencies: []
            },
            {
              id: 'task-2',
              projectId: 'project-1',
              sprintId,
              swimlaneId: 'lane-coding',
              title: 'Second task',
              sortOrder: 1,
              status: ProjectTaskStatusEnum.Doing,
              dependencies: []
            }
          ],
          total: 2
        })
      ),
      moveTasks: jest.fn().mockReturnValue(of([])),
      reorderInLane: jest.fn().mockReturnValue(of([])),
      update: jest.fn().mockReturnValue(of({}))
    }
    const teamBindingService = {
      listByProject: jest.fn().mockReturnValue(of({ items: [], total: 0 }))
    }
    const teamDefinitionService = {
      get: jest.fn()
    }
    const toastr = {
      error: jest.fn()
    }

    TestBed.configureTestingModule({
      providers: [
        ProjectPageFacade,
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: paramMap$.value,
              queryParamMap: queryParamMap$.value
            },
            paramMap: paramMap$.asObservable(),
            queryParamMap: queryParamMap$.asObservable(),
            firstChild: {
              snapshot: {
                routeConfig: {
                  path: childPath
                }
              }
            }
          }
        },
        {
          provide: Router,
          useValue: router
        },
        {
          provide: ProjectCoreService,
          useValue: projectCoreService
        },
        {
          provide: ProjectSprintService,
          useValue: projectSprintService
        },
        {
          provide: ProjectSwimlaneService,
          useValue: projectSwimlaneService
        },
        {
          provide: ProjectTaskService,
          useValue: projectTaskService
        },
        {
          provide: TeamBindingService,
          useValue: teamBindingService
        },
        {
          provide: TeamDefinitionService,
          useValue: teamDefinitionService
        },
        {
          provide: ToastrService,
          useValue: toastr
        }
      ]
    })

    const facade = TestBed.inject(ProjectPageFacade)
    await flushAsync()

    return {
      facade,
      router,
      projectTaskService,
      queryParamMap$
    }
  }

  it('falls back to the default sprint when the query sprint id is invalid', async () => {
    const { facade, router } = await createFacade({ sprintId: 'missing' })

    expect(facade.selectedSprintId()).toBe('sprint-running')
    expect(router.navigate).toHaveBeenCalledWith(['/project', 'project-1', 'kanban'], {
      queryParams: { sprintId: 'sprint-running' },
      queryParamsHandling: 'merge',
      replaceUrl: true
    })
  })

  it('navigates with the selected sprint id in query params', async () => {
    const { facade, router } = await createFacade()
    router.navigate.mockClear()

    await facade.selectSprint('sprint-planned')

    expect(router.navigate).toHaveBeenCalledWith(['/project', 'project-1', 'kanban'], {
      queryParams: { sprintId: 'sprint-planned' },
      queryParamsHandling: 'merge'
    })
  })

  it('redirects the root project route to the first project overview tab', async () => {
    const { router } = await createFacade(undefined, { projectId: null, childPath: 'overview' })

    expect(router.navigate).toHaveBeenCalledWith(['/project', 'project-1', 'overview'], {
      replaceUrl: true,
      queryParams: { sprintId: null },
      queryParamsHandling: 'merge'
    })
  })

  it('preserves the active tab when switching projects', async () => {
    const { facade, router } = await createFacade(undefined, { childPath: 'teams' })
    router.navigate.mockClear()

    await facade.selectProject('project-2')

    expect(router.navigate).toHaveBeenCalledWith(['/project', 'project-2', 'teams'], {
      queryParams: { sprintId: null },
      queryParamsHandling: 'merge'
    })
  })

  it('uses move plus reorder when a task is dropped into another swimlane', async () => {
    const { facade, projectTaskService } = await createFacade()
    projectTaskService.moveTasks.mockClear()
    projectTaskService.reorderInLane.mockClear()

    await facade.moveTask({
      taskId: 'task-2',
      sourceSwimlaneId: 'lane-coding',
      targetSwimlaneId: 'lane-backlog',
      targetOrderedTaskIds: ['task-2']
    })

    expect(projectTaskService.moveTasks).toHaveBeenCalledWith({
      taskIds: ['task-2'],
      targetSwimlaneId: 'lane-backlog'
    })
    expect(projectTaskService.reorderInLane).toHaveBeenCalledWith('lane-backlog', {
      orderedTaskIds: ['task-2']
    })
  })

  it('reorders within the same swimlane without calling move', async () => {
    const { facade, projectTaskService } = await createFacade()
    projectTaskService.moveTasks.mockClear()
    projectTaskService.reorderInLane.mockClear()

    await facade.moveTask({
      taskId: 'task-2',
      sourceSwimlaneId: 'lane-coding',
      targetSwimlaneId: 'lane-coding',
      targetOrderedTaskIds: ['task-2', 'task-1']
    })

    expect(projectTaskService.moveTasks).not.toHaveBeenCalled()
    expect(projectTaskService.reorderInLane).toHaveBeenCalledWith('lane-coding', {
      orderedTaskIds: ['task-2', 'task-1']
    })
  })
})

async function flushAsync() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}
