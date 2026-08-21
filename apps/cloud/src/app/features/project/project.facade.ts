import { Injectable, computed, inject, signal } from '@angular/core'
import type {
  IXpertProject,
  IXpertProjectActivity,
  IXpertProjectAsset,
  IXpertProjectAutomation,
  IXpertProjectPlan,
  IXpertProjectTask
} from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { XpertProjectApiService, XpertProjectOverview } from './project-api.service'

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
  readonly hasProject = computed(() => Boolean(this.project()))

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
    this.loading.set(true)
    this.error.set(null)
    try {
      const overview = await firstValueFrom(this.#api.overview(id))
      this.setOverview(overview)
      return overview
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load project')
      return null
    } finally {
      this.loading.set(false)
    }
  }

  async createProject(input: Partial<IXpertProject>) {
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

  async createTask(input: Partial<IXpertProjectTask>) {
    const project = this.project()
    if (!project) return null
    const task = await firstValueFrom(this.#api.createTask(project.id, input))
    this.tasks.update((items) => [...items, task])
    return task
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
