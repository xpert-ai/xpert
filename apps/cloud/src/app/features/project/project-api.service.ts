import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import type {
  IXpertProject,
  IXpertProjectActivity,
  IXpertProjectAsset,
  IXpertProjectAutomation,
  IXpertProjectPlan,
  IXpertProjectTask,
  IPagination
} from '@xpert-ai/contracts'
import { API_XPERT_PROJECT } from '@cloud/app/@core/constants/app.constants'

export interface XpertProjectOverview {
  project: IXpertProject
  plans: IXpertProjectPlan[] | { items: IXpertProjectPlan[]; total: number }
  tasks: IXpertProjectTask[] | { items: IXpertProjectTask[]; total: number }
  assets: IXpertProjectAsset[] | { items: IXpertProjectAsset[]; total: number }
  assetTotal?: number
  activities: IXpertProjectActivity[] | { items: IXpertProjectActivity[]; total: number }
  automations: IXpertProjectAutomation[] | { items: IXpertProjectAutomation[]; total: number }
}

@Injectable({ providedIn: 'root' })
export class XpertProjectApiService {
  readonly #http = inject(HttpClient)

  list(params: { search?: string; status?: string; skip?: number; take?: number } = {}) {
    const data = {
      // The workspace owns the status filter, including archived projects.
      // Legacy callers still use the server's active-only default.
      where: params.status ? { status: params.status } : { status: 'all' },
      order: { updatedAt: 'DESC' },
      skip: params.skip ?? 0,
      take: params.take ?? 50
    }
    return this.#http.get<IPagination<IXpertProject>>(`${API_XPERT_PROJECT}/my`, {
      params: new HttpParams().set('data', JSON.stringify(data))
    })
  }

  get(id: string) {
    return this.#http.get<IXpertProject>(`${API_XPERT_PROJECT}/${id}`, {
      params: new HttpParams().set(
        '$relations',
        JSON.stringify(['owner', 'members', 'xperts', 'toolsets', 'knowledges'])
      )
    })
  }

  overview(id: string) {
    return this.#http.get<XpertProjectOverview>(`${API_XPERT_PROJECT}/overview`, {
      params: new HttpParams().set('projectId', id)
    })
  }

  create(input: Partial<IXpertProject>) {
    return this.#http.post<IXpertProject>(API_XPERT_PROJECT, input)
  }

  importDsl(input: unknown) {
    return this.#http.post<IXpertProject>(`${API_XPERT_PROJECT}/import`, input)
  }

  update(id: string, input: Partial<IXpertProject>) {
    return this.#http.put<IXpertProject>(`${API_XPERT_PROJECT}/${id}`, input)
  }

  addXpert(id: string, xpertId: string) {
    return this.#http.put<IXpertProject>(`${API_XPERT_PROJECT}/${id}/xperts/${xpertId}`, {})
  }

  removeXpert(id: string, xpertId: string) {
    return this.#http.delete<IXpertProject>(`${API_XPERT_PROJECT}/${id}/xperts/${xpertId}`)
  }

  archive(id: string) {
    return this.#http.post<IXpertProject>(`${API_XPERT_PROJECT}/${id}/archive`, {})
  }

  plans(id: string) {
    return this.#http.get<IXpertProjectPlan[]>(`${API_XPERT_PROJECT}/${id}/plans`)
  }

  tasks(id: string) {
    return this.#http.get<IXpertProjectTask[]>(`${API_XPERT_PROJECT}/${id}/tasks`)
  }

  assets(
    id: string,
    options: { parentId?: string; kind?: IXpertProjectAsset['kind']; skip?: number; take?: number } = {}
  ) {
    let params = new HttpParams()
    if (options.parentId) params = params.set('parentId', options.parentId)
    if (options.kind) params = params.set('kind', options.kind)
    params = params.set('skip', options.skip ?? 0).set('take', options.take ?? 100)
    return this.#http.get<{ items: IXpertProjectAsset[]; total: number }>(`${API_XPERT_PROJECT}/${id}/assets`, {
      params
    })
  }

  activities(id: string) {
    return this.#http.get<IPagination<IXpertProjectActivity>>(`${API_XPERT_PROJECT}/${id}/activities`)
  }

  automations(id: string) {
    return this.#http.get<IXpertProjectAutomation[]>(`${API_XPERT_PROJECT}/${id}/automations`)
  }

  conversations(id: string) {
    return this.#http.get<{ items: Array<{ id: string; title?: string; updatedAt?: string }>; total: number }>(
      `${API_XPERT_PROJECT}/${id}/conversations`
    )
  }

  createPlan(id: string, input: Partial<IXpertProjectPlan>) {
    return this.#http.post<IXpertProjectPlan>(`${API_XPERT_PROJECT}/${id}/plans`, input)
  }

  createTask(id: string, input: Partial<IXpertProjectTask>) {
    return this.#http.post<IXpertProjectTask>(`${API_XPERT_PROJECT}/${id}/tasks`, input)
  }

  createAsset(id: string, input: Partial<IXpertProjectAsset>) {
    return this.#http.post<IXpertProjectAsset>(`${API_XPERT_PROJECT}/${id}/assets`, input)
  }

  updateAutomation(id: string, automationId: string, input: Partial<IXpertProjectAutomation>) {
    return this.#http.put<IXpertProjectAutomation>(`${API_XPERT_PROJECT}/${id}/automations/${automationId}`, input)
  }

  createAutomation(id: string, input: Partial<IXpertProjectAutomation>) {
    return this.#http.post<IXpertProjectAutomation>(`${API_XPERT_PROJECT}/${id}/automations`, input)
  }

  uploadFile(id: string, file: File) {
    const form = new FormData()
    form.append('file', file)
    return this.#http.post<{ url: string; asset: IXpertProjectAsset }>(`${API_XPERT_PROJECT}/${id}/file/upload`, form)
  }
}
