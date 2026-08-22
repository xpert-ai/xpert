import { Injectable, computed, inject, signal } from '@angular/core'
import type {
  IXpertProject,
  IXpertProjectCreateInput,
  IXpertProjectActivity,
  IXpertProjectAsset,
  IXpertProjectAutomation,
  IXpertProjectMilestone,
  IXpertProjectPlan,
  IXpertProjectSprint,
  IXpertProjectTask
} from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { XpertProjectApiService, XpertProjectOverview, XpertProjectTaskRelations } from './project-api.service'

const itemsOf = <T>(value: T[] | { items: T[]; total: number } | undefined) =>
  Array.isArray(value) ? value : (value?.items ?? [])

@Injectable({ providedIn: 'root' })
export class XpertProjectFacade {
  readonly #api = inject(XpertProjectApiService)
  readonly project = signal<IXpertProject | null>(null)
  readonly projects = signal<IXpertProject[]>([])
  readonly plans = signal<IXpertProjectPlan[]>([])
  readonly tasks = signal<IXpertProjectTask[]>([])
  readonly assets = signal<IXpertProjectAsset[]>([])
  readonly assetsTotal = signal(0)
  readonly assetCount = signal(0)
  readonly assetsLoading = signal(false)
  readonly assetsError = signal<string | null>(null)
  readonly activities = signal<IXpertProjectActivity[]>([])
  readonly automations = signal<IXpertProjectAutomation[]>([])
  readonly loading = signal(false)
  readonly error = signal<string | null>(null)
  readonly projectLoading = signal(false)
  readonly projectError = signal<string | null>(null)
  readonly hasProject = computed(() => Boolean(this.project()))
  #projectLoadSequence = 0

  async loadProjects(query: { search?: string; status?: string } = {}) {
    this.loading.set(true)
    this.error.set(null)
    try {
      const response = await firstValueFrom(this.#api.list(query))
      this.projects.set(response.items ?? [])
      return response.items ?? []
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load projects')
      return []
    } finally {
      this.loading.set(false)
    }
  }

  async loadProject(id: string) {
    const sequence = ++this.#projectLoadSequence
    this.projectLoading.set(true)
    this.projectError.set(null)
    this.loading.set(true)
    this.error.set(null)
    try {
      const overview = await firstValueFrom(this.#api.overview(id))
      if (sequence !== this.#projectLoadSequence) return null
      this.setOverview(overview)
      return overview
    } catch (error) {
      if (sequence !== this.#projectLoadSequence) return null
      const message = error instanceof Error ? error.message : 'Failed to load project'
      this.projectError.set(message)
      this.error.set(message)
      return null
    } finally {
      if (sequence === this.#projectLoadSequence) {
        this.projectLoading.set(false)
        this.loading.set(false)
      }
    }
  }

  async createProject(input: IXpertProjectCreateInput) {
    const project = await firstValueFrom(this.#api.create(input))
    this.project.set(project)
    this.projects.update((items) => [project, ...items])
    return project
  }

  async updateProject(input: Partial<IXpertProject>) {
    const project = this.project()
    if (!project) return null
    const updated = await firstValueFrom(this.#api.update(project.id, input))
    this.project.set({ ...project, ...updated })
    this.projects.update((items) => items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
    return updated
  }

  async bindWorkspace(workspaceId: string) {
    const project = this.project()
    if (!project || !workspaceId) return null
    const updated = await firstValueFrom(this.#api.bindWorkspace(project.id, workspaceId))
    this.project.set({ ...project, ...updated })
    this.projects.update((items) => items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
    return updated
  }

  async bindXpert(xpertId: string) {
    const project = this.project()
    if (!project || !xpertId) return null
    const updated = await firstValueFrom(this.#api.addXpert(project.id, xpertId))
    this.project.set({ ...project, ...updated })
    this.projects.update((items) => items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
    return updated
  }

  async createPlan(input: Partial<IXpertProjectPlan>) {
    const project = this.project()
    if (!project) return null
    const plan = await firstValueFrom(this.#api.createPlan(project.id, input))
    this.plans.update((items) => [...items, plan])
    return plan
  }

  async updatePlan(planId: string, input: Partial<IXpertProjectPlan>) {
    const project = this.project()
    if (!project) return null
    const plan = await firstValueFrom(this.#api.updatePlan(project.id, planId, input))
    this.plans.update((items) => items.map((item) => (item.id === plan.id ? { ...item, ...plan } : item)))
    return plan
  }

  async createMilestone(planId: string, input: Partial<IXpertProjectMilestone>) {
    const project = this.project()
    if (!project) return null
    const milestone = await firstValueFrom(this.#api.createMilestone(project.id, planId, input))
    this.plans.update((items) =>
      items.map((plan) =>
        plan.id === planId ? { ...plan, milestones: [...(plan.milestones ?? []), milestone] } : plan
      )
    )
    return milestone
  }

  async updateMilestone(planId: string, milestoneId: string, input: Partial<IXpertProjectMilestone>) {
    const project = this.project()
    if (!project) return null
    const milestone = await firstValueFrom(this.#api.updateMilestone(project.id, planId, milestoneId, input))
    this.plans.update((items) =>
      items.map((plan) =>
        plan.id === planId
          ? {
              ...plan,
              milestones: (plan.milestones ?? []).map((item) =>
                item.id === milestone.id ? { ...item, ...milestone } : item
              )
            }
          : plan
      )
    )
    return milestone
  }

  async createTask(input: Partial<IXpertProjectTask>) {
    const project = this.project()
    if (!project) return null
    const task = await firstValueFrom(this.#api.createTask(project.id, input))
    this.tasks.update((items) => [...items, task])
    return task
  }

  async updateTask(taskId: string, input: Partial<IXpertProjectTask>) {
    const project = this.project()
    if (!project) return null
    const task = await firstValueFrom(this.#api.updateTask(project.id, taskId, input))
    this.tasks.update((items) => items.map((item) => (item.id === task.id ? { ...item, ...task } : item)))
    return task
  }

  async loadTaskRelations(taskId: string): Promise<XpertProjectTaskRelations> {
    const project = this.project()
    if (!project) return { conversations: [], executions: [] }
    return await firstValueFrom(this.#api.taskRelations(project.id, taskId))
  }

  async createSprint(planId: string, input: Partial<IXpertProjectSprint>) {
    const project = this.project()
    if (!project) return null
    const sprint = await firstValueFrom(this.#api.createSprint(project.id, planId, input))
    this.plans.update((plans) =>
      plans.map((plan) => (plan.id === planId ? { ...plan, sprints: [...(plan.sprints ?? []), sprint] } : plan))
    )
    return sprint
  }

  async createAsset(input: Partial<IXpertProjectAsset>) {
    const project = this.project()
    if (!project) return null
    const asset = await firstValueFrom(this.#api.createAsset(project.id, input))
    this.assets.update((items) => [...items, asset])
    return asset
  }

  async uploadAsset(file: File) {
    const project = this.project()
    if (!project) return null
    const response = await firstValueFrom(this.#api.uploadFile(project.id, file))
    this.assets.update((items) => [...items, response.asset])
    return response.asset
  }

  async loadAssets(
    projectId: string,
    options: {
      parentId?: string
      kind?: IXpertProjectAsset['kind']
      skip?: number
      take?: number
      append?: boolean
    } = {}
  ) {
    this.assetsLoading.set(true)
    this.assetsError.set(null)
    const skip = options.skip ?? 0
    try {
      const response = await firstValueFrom(this.#api.assets(projectId, options))
      const items = response.items ?? []
      this.assets.update((current) => (options.append ? [...current, ...items] : items))
      this.assetsTotal.set(response.total ?? items.length)
      if (!options.parentId) this.assetCount.set(response.total ?? items.length)
      return response
    } catch (error) {
      this.assetsError.set(error instanceof Error ? error.message : 'Failed to load assets')
      return { items: [], total: skip }
    } finally {
      this.assetsLoading.set(false)
    }
  }

  async updateAutomation(automationId: string, input: Partial<IXpertProjectAutomation>) {
    const project = this.project()
    if (!project) return null
    const automation = await firstValueFrom(this.#api.updateAutomation(project.id, automationId, input))
    this.automations.update((items) =>
      items.map((item) => (item.id === automation.id ? { ...item, ...automation } : item))
    )
    return automation
  }

  async createAutomation(input: Partial<IXpertProjectAutomation>) {
    const project = this.project()
    if (!project) return null
    const automation = await firstValueFrom(this.#api.createAutomation(project.id, input))
    this.automations.update((items) => [...items, automation])
    return automation
  }

  private setOverview(overview: XpertProjectOverview) {
    this.project.set(overview.project)
    this.plans.set(itemsOf(overview.plans))
    this.tasks.set(itemsOf(overview.tasks))
    this.assets.set(itemsOf(overview.assets))
    this.assetsTotal.set(totalOf(overview.assets))
    this.assetCount.set(overview.assetTotal ?? totalOf(overview.assets))
    this.activities.set(itemsOf(overview.activities))
    this.automations.set(itemsOf(overview.automations))
  }
}

const totalOf = <T>(value: T[] | { items: T[]; total: number } | undefined) =>
  Array.isArray(value) ? value.length : (value?.total ?? 0)
