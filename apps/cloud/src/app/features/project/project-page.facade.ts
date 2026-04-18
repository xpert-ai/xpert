import { computed, effect, inject, Injectable, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { IProjectCore, IProjectSprint, IProjectTask } from '@xpert-ai/contracts'
import { OrderTypeEnum } from '@xpert-ai/cloud/state'
import { firstValueFrom } from 'rxjs'
import {
  ProjectCoreService,
  ProjectSprintService,
  ProjectSwimlaneService,
  ProjectTaskService,
  getErrorMessage
} from '../../@core'
import { buildProjectBoardColumns, formatProjectLabel, pickDefaultSprint } from './project-page.utils'

@Injectable()
export class ProjectPageFacade {
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #projectCoreService = inject(ProjectCoreService)
  readonly #projectSprintService = inject(ProjectSprintService)
  readonly #projectSwimlaneService = inject(ProjectSwimlaneService)
  readonly #projectTaskService = inject(ProjectTaskService)

  readonly #projectId = toSignal(this.#route.paramMap, {
    initialValue: this.#route.snapshot.paramMap
  })

  readonly loading = signal(true)
  readonly error = signal<string | null>(null)
  readonly projects = signal<IProjectCore[]>([])
  readonly sprints = signal<IProjectSprint[]>([])
  readonly tasks = signal<IProjectTask[]>([])
  readonly boardColumns = signal(buildProjectBoardColumns([], []))

  readonly projectId = computed(() => this.#projectId().get('projectId'))
  readonly selectedProject = computed(
    () => this.projects().find((project) => project.id === this.projectId()) ?? null
  )
  readonly selectedSprint = computed(() => pickDefaultSprint(this.sprints()))
  readonly hasProjects = computed(() => this.projects().length > 0)
  readonly hasSprint = computed(() => !!this.selectedSprint())
  readonly hasTasks = computed(() => this.tasks().length > 0)
  readonly selectedTaskCount = computed(() => this.tasks().length)
  readonly selectedLaneCount = computed(() => this.boardColumns().length)
  readonly selectedSprintLabel = computed(() => formatProjectLabel(this.selectedSprint()?.status))
  readonly selectedStrategyLabel = computed(() => formatProjectLabel(this.selectedSprint()?.strategyType))

  #loadVersion = 0

  constructor() {
    effect(
      () => {
        void this.loadProjectPage(this.projectId())
      },
      { allowSignalWrites: true }
    )
  }

  async selectProject(projectId: string) {
    if (!projectId || projectId === this.projectId()) {
      return
    }

    await this.#router.navigate(['/project', projectId])
  }

  private async loadProjectPage(projectId: string | null) {
    const currentLoad = ++this.#loadVersion
    this.loading.set(true)
    this.error.set(null)

    try {
      const { items: projects = [] } = await firstValueFrom(
        this.#projectCoreService.list({
          order: {
            updatedAt: OrderTypeEnum.DESC
          }
        })
      )

      if (currentLoad !== this.#loadVersion) {
        return
      }

      this.projects.set(projects)

      if (!projects.length) {
        this.sprints.set([])
        this.tasks.set([])
        this.boardColumns.set([])
        return
      }

      if (!projectId) {
        await this.#router.navigate(['/project', projects[0].id], { replaceUrl: true })
        return
      }

      if (!projects.some((project) => project.id === projectId)) {
        await this.#router.navigate(['/project'], { replaceUrl: true })
        return
      }

      const { items: sprints = [] } = await firstValueFrom(
        this.#projectSprintService.listByProject(projectId, {
          order: {
            updatedAt: OrderTypeEnum.DESC
          }
        })
      )

      if (currentLoad !== this.#loadVersion) {
        return
      }

      this.sprints.set(sprints)

      const activeSprint = pickDefaultSprint(sprints)
      if (!activeSprint?.id) {
        this.tasks.set([])
        this.boardColumns.set([])
        return
      }

      const [{ items: swimlanes = [] }, { items: tasks = [] }] = await Promise.all([
        firstValueFrom(
          this.#projectSwimlaneService.listBySprint(projectId, activeSprint.id, {
            order: {
              sortOrder: OrderTypeEnum.ASC
            }
          })
        ),
        firstValueFrom(
          this.#projectTaskService.listBySprint(projectId, activeSprint.id, {
            order: {
              updatedAt: OrderTypeEnum.DESC
            }
          })
        )
      ])

      if (currentLoad !== this.#loadVersion) {
        return
      }

      this.tasks.set(tasks)
      this.boardColumns.set(buildProjectBoardColumns(swimlanes, tasks))
    } catch (error) {
      if (currentLoad !== this.#loadVersion) {
        return
      }

      this.projects.set([])
      this.sprints.set([])
      this.tasks.set([])
      this.boardColumns.set([])
      this.error.set(getErrorMessage(error))
    } finally {
      if (currentLoad === this.#loadVersion) {
        this.loading.set(false)
      }
    }
  }
}
