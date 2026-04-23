import { computed, effect, inject, Injectable, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import {
  IProjectCore,
  IProjectSprint,
  IProjectSwimlane,
  IProjectTask,
  ProjectSwimlaneKindEnum,
  ProjectTaskStatusEnum
} from '@xpert-ai/contracts'
import { OrderTypeEnum } from '@xpert-ai/cloud/state'
import { firstValueFrom } from 'rxjs'
import {
  ProjectCoreService,
  ProjectSprintService,
  ProjectSwimlaneService,
  ProjectTaskService,
  TeamBindingService,
  TeamDefinitionService,
  getErrorMessage,
  injectToastr
} from '../../@core'
import {
  buildProjectBoardColumns,
  formatProjectLabel,
  getBacklogSwimlane,
  pickRequestedSprint,
  ProjectBoardTaskDropEvent,
  ProjectBoundTeamViewModel
} from './project-page.utils'

@Injectable()
export class ProjectPageFacade {
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #projectCoreService = inject(ProjectCoreService)
  readonly #projectSprintService = inject(ProjectSprintService)
  readonly #projectSwimlaneService = inject(ProjectSwimlaneService)
  readonly #projectTaskService = inject(ProjectTaskService)
  readonly #teamBindingService = inject(TeamBindingService)
  readonly #teamDefinitionService = inject(TeamDefinitionService)
  readonly #toastr = injectToastr()

  readonly #projectParamMap = toSignal(this.#route.paramMap, {
    initialValue: this.#route.snapshot.paramMap
  })
  readonly #queryParamMap = toSignal(this.#route.queryParamMap, {
    initialValue: this.#route.snapshot.queryParamMap
  })

  readonly pageLoading = signal(true)
  readonly boardLoading = signal(false)
  readonly error = signal<string | null>(null)
  readonly projects = signal<IProjectCore[]>([])
  readonly sprints = signal<IProjectSprint[]>([])
  readonly swimlanes = signal<IProjectSwimlane[]>([])
  readonly tasks = signal<IProjectTask[]>([])
  readonly boundTeams = signal<ProjectBoundTeamViewModel[]>([])
  readonly selectedSprintId = signal<string | null>(null)

  readonly projectId = computed(() => this.#projectParamMap().get('projectId'))
  readonly requestedSprintId = computed(() => this.#queryParamMap().get('sprintId'))
  readonly loading = computed(() => this.pageLoading())
  readonly selectedProject = computed(
    () => this.projects().find((project) => project.id === this.projectId()) ?? null
  )
  readonly selectedSprint = computed(
    () => this.sprints().find((sprint) => sprint.id === this.selectedSprintId()) ?? null
  )
  readonly boardColumns = computed(() => buildProjectBoardColumns(this.swimlanes(), this.tasks()))
  readonly hasProjects = computed(() => this.projects().length > 0)
  readonly hasSprint = computed(() => !!this.selectedSprint())
  readonly hasTasks = computed(() => this.tasks().length > 0)
  readonly selectedTaskCount = computed(() => this.tasks().length)
  readonly selectedLaneCount = computed(() => this.swimlanes().length)
  readonly selectedTeamCount = computed(() => this.boundTeams().length)
  readonly selectedSprintLabel = computed(() => formatProjectLabel(this.selectedSprint()?.status))
  readonly selectedStrategyLabel = computed(() => formatProjectLabel(this.selectedSprint()?.strategyType))
  readonly teamNameById = computed(() => new Map(this.boundTeams().map(({ team }) => [team.id, team.name])))
  readonly swimlaneById = computed(() => new Map(this.swimlanes().map((lane) => [lane.id ?? '', lane])))
  readonly backlogSwimlane = computed(() => getBacklogSwimlane(this.swimlanes()))

  #contextLoadVersion = 0
  #boardLoadVersion = 0

  constructor() {
    effect(
      () => {
        void this.loadProjectContext(this.projectId())
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        const sprint = pickRequestedSprint(this.sprints(), this.requestedSprintId())
        this.selectedSprintId.set(sprint?.id ?? null)
      },
      { allowSignalWrites: true }
    )

    effect(() => {
      const projectId = this.projectId()
      const sprintId = this.selectedSprintId()
      const requestedSprintId = this.requestedSprintId()

      if (!projectId || !sprintId || requestedSprintId === sprintId) {
        return
      }

      void this.#router.navigate(['/project', projectId], {
        queryParams: { sprintId },
        queryParamsHandling: 'merge',
        replaceUrl: true
      })
    })

    effect(
      () => {
        void this.loadSprintBoard(this.projectId(), this.selectedSprintId())
      },
      { allowSignalWrites: true }
    )
  }

  async selectProject(projectId: string) {
    if (!projectId || projectId === this.projectId()) {
      return
    }

    await this.#router.navigate(['/project', projectId], {
      queryParams: { sprintId: null },
      queryParamsHandling: 'merge'
    })
  }

  async selectSprint(sprintId: string | null) {
    if (!this.projectId() || sprintId === this.selectedSprintId()) {
      return
    }

    await this.#router.navigate(['/project', this.projectId()], {
      queryParams: { sprintId: sprintId ?? null },
      queryParamsHandling: 'merge'
    })
  }

  async refresh() {
    await this.loadProjectContext(this.projectId())
    await this.loadSprintBoard(this.projectId(), this.selectedSprintId())
  }

  async refreshBoard() {
    await this.loadSprintBoard(this.projectId(), this.selectedSprintId())
  }

  async moveTask(event: ProjectBoardTaskDropEvent) {
    if (!event.targetOrderedTaskIds.length) {
      return
    }

    const snapshot = this.cloneTasks(this.tasks())
    const optimisticTasks = this.applyTaskDrop(snapshot, event)
    this.tasks.set(optimisticTasks)

    try {
      if (event.sourceSwimlaneId === event.targetSwimlaneId) {
        await firstValueFrom(
          this.#projectTaskService.reorderInLane(event.targetSwimlaneId, {
            orderedTaskIds: event.targetOrderedTaskIds
          })
        )
      } else {
        await firstValueFrom(
          this.#projectTaskService.moveTasks({
            taskIds: [event.taskId],
            targetSwimlaneId: event.targetSwimlaneId
          })
        )
        await firstValueFrom(
          this.#projectTaskService.reorderInLane(event.targetSwimlaneId, {
            orderedTaskIds: event.targetOrderedTaskIds
          })
        )
      }

      await this.refreshBoard()
    } catch (error) {
      this.tasks.set(snapshot)
      this.#toastr.error(getErrorMessage(error))
    }
  }

  async updateTaskStatus(task: IProjectTask, status: ProjectTaskStatusEnum) {
    if (!task.id || task.status === status) {
      return
    }

    const lane = this.swimlaneById().get(task.swimlaneId)
    if ((lane?.kind ?? ProjectSwimlaneKindEnum.Execution) === ProjectSwimlaneKindEnum.Backlog) {
      return
    }

    const snapshot = this.cloneTasks(this.tasks())
    this.tasks.set(
      snapshot.map((currentTask) =>
        currentTask.id === task.id
          ? {
              ...currentTask,
              status
            }
          : currentTask
      )
    )

    try {
      await firstValueFrom(this.#projectTaskService.update(task.id, { status }))
      await this.refreshBoard()
    } catch (error) {
      this.tasks.set(snapshot)
      this.#toastr.error(getErrorMessage(error))
    }
  }

  private async loadProjectContext(projectId: string | null) {
    const currentLoad = ++this.#contextLoadVersion
    this.pageLoading.set(true)
    this.error.set(null)

    try {
      const { items: projects = [] } = await firstValueFrom(
        this.#projectCoreService.list({
          order: {
            updatedAt: OrderTypeEnum.DESC
          }
        })
      )

      if (currentLoad !== this.#contextLoadVersion) {
        return
      }

      this.projects.set(projects)

      if (!projects.length) {
        this.clearProjectScopedState()
        return
      }

      if (!projectId) {
        this.clearProjectScopedState()
        await this.#router.navigate(['/project', projects[0].id], {
          replaceUrl: true,
          queryParams: { sprintId: null },
          queryParamsHandling: 'merge'
        })
        return
      }

      if (!projects.some((project) => project.id === projectId)) {
        this.clearProjectScopedState()
        await this.#router.navigate(['/project'], {
          replaceUrl: true,
          queryParams: { sprintId: null },
          queryParamsHandling: 'merge'
        })
        return
      }

      const [{ items: sprints = [] }, { items: teamBindings = [] }] = await Promise.all([
        firstValueFrom(
          this.#projectSprintService.listByProject(projectId, {
            order: {
              updatedAt: OrderTypeEnum.DESC
            }
          })
        ),
        firstValueFrom(this.#teamBindingService.listByProject(projectId))
      ])

      if (currentLoad !== this.#contextLoadVersion) {
        return
      }

      const boundTeams = await Promise.all(
        teamBindings.map(async (binding) => ({
          binding,
          team: await firstValueFrom(this.#teamDefinitionService.get(binding.teamId))
        }))
      )

      if (currentLoad !== this.#contextLoadVersion) {
        return
      }

      this.sprints.set(sprints)
      this.boundTeams.set(boundTeams)
    } catch (error) {
      if (currentLoad !== this.#contextLoadVersion) {
        return
      }

      this.projects.set([])
      this.clearProjectScopedState()
      this.error.set(getErrorMessage(error))
    } finally {
      if (currentLoad === this.#contextLoadVersion) {
        this.pageLoading.set(false)
      }
    }
  }

  private async loadSprintBoard(projectId: string | null, sprintId: string | null) {
    const currentLoad = ++this.#boardLoadVersion
    this.error.set(null)

    if (!projectId || !sprintId) {
      this.swimlanes.set([])
      this.tasks.set([])
      this.boardLoading.set(false)
      return
    }

    this.boardLoading.set(true)

    try {
      const [{ items: swimlanes = [] }, { items: tasks = [] }] = await Promise.all([
        firstValueFrom(
          this.#projectSwimlaneService.listBySprint(projectId, sprintId, {
            order: {
              sortOrder: OrderTypeEnum.ASC
            }
          })
        ),
        firstValueFrom(
          this.#projectTaskService.listBySprint(projectId, sprintId, {
            order: {
              sortOrder: OrderTypeEnum.ASC,
              createdAt: OrderTypeEnum.ASC
            }
          })
        )
      ])

      if (currentLoad !== this.#boardLoadVersion) {
        return
      }

      this.swimlanes.set(swimlanes)
      this.tasks.set(tasks)
    } catch (error) {
      if (currentLoad !== this.#boardLoadVersion) {
        return
      }

      this.swimlanes.set([])
      this.tasks.set([])
      this.error.set(getErrorMessage(error))
    } finally {
      if (currentLoad === this.#boardLoadVersion) {
        this.boardLoading.set(false)
      }
    }
  }

  private clearProjectScopedState() {
    this.sprints.set([])
    this.swimlanes.set([])
    this.tasks.set([])
    this.boundTeams.set([])
    this.selectedSprintId.set(null)
  }

  private cloneTasks(tasks: IProjectTask[]) {
    return tasks.map((task) => ({
      ...task,
      dependencies: [...task.dependencies]
    }))
  }

  private applyTaskDrop(tasks: IProjectTask[], event: ProjectBoardTaskDropEvent) {
    const targetLane = this.swimlaneById().get(event.targetSwimlaneId)
    const taskById = new Map(tasks.map((task) => [task.id ?? '', task]))
    const movedTask = taskById.get(event.taskId)

    if (!movedTask) {
      return tasks
    }

    const otherTasks = tasks.filter((task) => task.id !== event.taskId)
    const targetTaskIds = new Set(event.targetOrderedTaskIds)
    const remainingTargetTasks = otherTasks.filter((task) => task.swimlaneId === event.targetSwimlaneId && !targetTaskIds.has(task.id ?? ''))
    const targetTasks = [...event.targetOrderedTaskIds, ...remainingTargetTasks.map((task) => task.id ?? '')]
      .map((taskId, index) => {
        if (taskId === movedTask.id) {
          return {
            ...movedTask,
            swimlaneId: event.targetSwimlaneId,
            sortOrder: index,
            ...(targetLane?.kind === ProjectSwimlaneKindEnum.Backlog
              ? {
                  dependencies: [],
                  status: ProjectTaskStatusEnum.Todo
                }
              : {})
          }
        }

        const task = taskById.get(taskId)
        if (!task) {
          return null
        }

        return {
          ...task,
          sortOrder: index
        }
      })
      .filter((task): task is IProjectTask => task !== null)

    const untouchedTasks = otherTasks.filter((task) => task.swimlaneId !== event.targetSwimlaneId)

    return [...untouchedTasks, ...targetTasks]
  }
}
