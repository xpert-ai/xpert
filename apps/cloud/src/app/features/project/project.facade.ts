import { Injectable, computed, inject, signal } from '@angular/core'
import {
  OrderTypeEnum,
  type IChatConversation,
  type IXpertProject,
  type IXpertProjectCreateInput,
  type IXpertProjectActivity,
  type IXpertProjectAsset,
  type IXpertProjectAutomation,
  type IXpertProjectMilestone,
  type IXpertProjectPlan,
  type IXpertProjectSprint,
  type IXpertProjectTask,
  type IXpertTask,
  type TXpertProjectAccessSummary,
  type TXpertProjectSkillSummary
} from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, XpertTaskService } from '@cloud/app/@core'
import { XpertProjectApiService, XpertProjectOverview, XpertProjectTaskRelations } from './project-api.service'

const itemsOf = <T>(value: T[] | { items: T[]; total: number } | undefined) =>
  Array.isArray(value) ? value : (value?.items ?? [])

@Injectable({ providedIn: 'root' })
export class XpertProjectFacade {
  readonly #api = inject(XpertProjectApiService)
  readonly #taskService = inject(XpertTaskService)
  readonly project = signal<IXpertProject | null>(null)
  readonly projects = signal<IXpertProject[]>([])
  readonly plans = signal<IXpertProjectPlan[]>([])
  readonly tasks = signal<IXpertProjectTask[]>([])
  readonly conversations = signal<IChatConversation[]>([])
  readonly conversationsLoading = signal(false)
  readonly conversationsError = signal<string | null>(null)
  readonly assets = signal<IXpertProjectAsset[]>([])
  readonly assetsTotal = signal(0)
  readonly assetCount = signal(0)
  readonly assetsLoading = signal(false)
  readonly assetsError = signal<string | null>(null)
  readonly activities = signal<IXpertProjectActivity[]>([])
  readonly automations = signal<IXpertProjectAutomation[]>([])
  readonly scheduledTasks = signal<IXpertTask[]>([])
  readonly projectInstruction = signal('')
  readonly projectSkills = signal<TXpertProjectSkillSummary[]>([])
  readonly projectAccess = signal<TXpertProjectAccessSummary | null>(null)
  readonly projectContentError = signal<string | null>(null)
  readonly loading = signal(false)
  readonly error = signal<string | null>(null)
  readonly projectLoading = signal(false)
  readonly projectError = signal<string | null>(null)
  readonly hasProject = computed(() => Boolean(this.project()))
  #projectsLoadSequence = 0
  #projectLoadSequence = 0

  async loadProjects(query: { search?: string; status?: string } = {}) {
    const sequence = ++this.#projectsLoadSequence
    this.loading.set(true)
    this.error.set(null)
    try {
      const response = await firstValueFrom(this.#api.list(query))
      if (sequence !== this.#projectsLoadSequence) return this.projects()
      this.projects.set(response.items ?? [])
      return response.items ?? []
    } catch (error) {
      if (sequence !== this.#projectsLoadSequence) return this.projects()
      this.error.set(getErrorMessage(error) || 'Failed to load projects')
      return []
    } finally {
      if (sequence === this.#projectsLoadSequence) this.loading.set(false)
    }
  }

  async loadProject(id: string) {
    const sequence = ++this.#projectLoadSequence
    this.projectLoading.set(true)
    this.projectError.set(null)
    this.loading.set(true)
    this.error.set(null)
    this.conversations.set([])
    this.conversationsError.set(null)
    this.plans.set([])
    this.tasks.set([])
    this.assets.set([])
    this.assetsTotal.set(0)
    this.assetCount.set(0)
    this.activities.set([])
    this.automations.set([])
    this.projectInstruction.set('')
    this.projectSkills.set([])
    this.projectAccess.set(null)
    this.projectContentError.set(null)
    this.scheduledTasks.set([])
    try {
      const project = await firstValueFrom(this.#api.get(id))
      if (sequence !== this.#projectLoadSequence) return null
      this.project.set(project)
      this.projectLoading.set(false)
      this.loading.set(false)
      void this.loadProjectOverview(id, sequence)
      void this.loadProjectContent(id, sequence)
      void this.loadProjectAccess(id, sequence)
      void this.loadScheduledTasks(id, sequence)
      return project
    } catch (error) {
      if (sequence !== this.#projectLoadSequence) return null
      const message = getErrorMessage(error) || 'Failed to load project'
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

  async loadConversations(projectId = this.project()?.id) {
    const id = projectId?.trim()
    if (!id) {
      this.conversations.set([])
      return []
    }

    this.conversationsLoading.set(true)
    this.conversationsError.set(null)
    try {
      const response = await firstValueFrom(this.#api.conversations(id))
      const items = response.items ?? []
      this.conversations.set(items)
      return items
    } catch (error) {
      this.conversationsError.set(getErrorMessage(error) || 'Failed to load conversations')
      this.conversations.set([])
      return []
    } finally {
      this.conversationsLoading.set(false)
    }
  }

  async createProject(input: IXpertProjectCreateInput) {
    const project = await firstValueFrom(this.#api.create(input))
    ++this.#projectsLoadSequence
    this.loading.set(false)
    this.project.set(project)
    this.projects.update((items) => [project, ...items.filter((item) => item.id !== project.id)])
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

  async saveProjectInstructions(content: string) {
    const projectId = this.project()?.id
    if (!projectId) return null
    const response = await firstValueFrom(this.#api.updateInstructions(projectId, content))
    this.projectInstruction.set(response.content)
    return response
  }

  async reloadScheduledTasks(projectId = this.project()?.id) {
    const id = projectId?.trim()
    if (!id) {
      this.scheduledTasks.set([])
      return []
    }
    return this.loadScheduledTasks(id, this.#projectLoadSequence)
  }

  async reloadProjectContent(projectId = this.project()?.id) {
    const id = projectId?.trim()
    if (!id) {
      this.projectInstruction.set('')
      this.projectSkills.set([])
      return []
    }
    await this.loadProjectContent(id, this.#projectLoadSequence)
    return this.projectSkills()
  }

  async addXpert(xpertId: string) {
    const project = this.project()
    if (!project || !xpertId) return null
    const updated = await firstValueFrom(this.#api.addXpert(project.id, xpertId))
    this.project.set({ ...project, ...updated })
    this.projects.update((items) => items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
    return updated
  }

  async removeXpert(xpertId: string) {
    const project = this.project()
    if (!project || !xpertId) return null
    const updated = await firstValueFrom(this.#api.removeXpert(project.id, xpertId))
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

  async reorderTasks(items: Array<{ id: string; order: number; column?: string }>) {
    const project = this.project()
    if (!project || !items.length) return []
    const tasks = await firstValueFrom(this.#api.reorderTasks(project.id, items))
    const updatedById = new Map(tasks.map((task) => [task.id, task]))
    this.tasks.update((current) => current.map((task) => updatedById.get(task.id) ?? task))
    return tasks
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
      this.assetsError.set(getErrorMessage(error) || 'Failed to load assets')
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

  private async loadProjectOverview(projectId: string, sequence: number) {
    try {
      const overview = await firstValueFrom(this.#api.overview(projectId))
      if (sequence === this.#projectLoadSequence) this.setOverview(overview)
    } catch {
      // The project shell remains usable when optional overview data is unavailable.
    }
  }

  private async loadProjectContent(projectId: string, sequence: number) {
    this.projectContentError.set(null)
    const [instructions, skills] = await Promise.allSettled([
      firstValueFrom(this.#api.instructions(projectId)),
      firstValueFrom(this.#api.skills(projectId))
    ])
    if (sequence !== this.#projectLoadSequence) return

    if (instructions.status === 'fulfilled') {
      this.projectInstruction.set(instructions.value.content)
    } else {
      this.projectInstruction.set('')
      this.projectContentError.set(getErrorMessage(instructions.reason) || 'Failed to load project instructions')
    }
    if (skills.status === 'fulfilled') {
      this.projectSkills.set(skills.value.items ?? [])
    } else {
      this.projectSkills.set([])
      this.projectContentError.set(
        this.projectContentError() || getErrorMessage(skills.reason) || 'Failed to load project skills'
      )
    }
  }

  private async loadProjectAccess(projectId: string, sequence: number) {
    try {
      const access = await firstValueFrom(this.#api.access(projectId))
      if (sequence === this.#projectLoadSequence) this.projectAccess.set(access)
    } catch {
      if (sequence === this.#projectLoadSequence) this.projectAccess.set(null)
    }
  }

  private async loadScheduledTasks(projectId: string, sequence: number) {
    try {
      const response = await firstValueFrom(
        this.#taskService.getAll({
          where: { projectId },
          order: { createdAt: OrderTypeEnum.DESC },
          take: 50
        })
      )
      if (sequence === this.#projectLoadSequence) this.scheduledTasks.set(response.items ?? [])
      return response.items ?? []
    } catch {
      if (sequence === this.#projectLoadSequence) this.scheduledTasks.set([])
      return []
    }
  }
}

const totalOf = <T>(value: T[] | { items: T[]; total: number } | undefined) =>
  Array.isArray(value) ? value.length : (value?.total ?? 0)
