import { inject, Injectable } from '@angular/core'
import {
  IChatConversation,
  IUser,
  IXpert,
  IXpertProjectFile,
  IXpertProjectTask,
  IXpertToolset,
  OrganizationBaseCrudService,
  PaginationParams,
  toHttpParams
} from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, switchMap } from 'rxjs'
import { API_XPERT_PROJECT } from '../constants/app.constants'
import { IXpertProject } from '../types'

@Injectable({ providedIn: 'root' })
export class XpertProjectService extends OrganizationBaseCrudService<IXpertProject> {
  readonly #logger = inject(NGXLogger)

  readonly #refresh = new BehaviorSubject<void>(null)

  constructor() {
    super(API_XPERT_PROJECT)
  }

  getAllMy(params?: PaginationParams<IXpertProject>) {
    return this.selectOrganizationId().pipe(
      switchMap(() =>
        this.#refresh.pipe(
          switchMap(() =>
            this.httpClient.get<{ items: IXpertProject[] }>(this.apiBaseUrl + `/my`, { params: toHttpParams(params) })
          )
        )
      )
    )
  }

  getConversations(id: string) {
    return this.httpClient.get<{ items: IChatConversation[]; total: number }>(this.apiBaseUrl + `/${id}/conversations`)
  }

  getXperts(id: string, params: PaginationParams<IXpertProject>) {
    return this.httpClient.get<{ items: IXpert[]; total: number }>(this.apiBaseUrl + `/${id}/xperts`, {
      params: toHttpParams(params)
    })
  }

  addXpert(id: string, xpertId: string) {
    return this.httpClient.put(this.apiBaseUrl + `/${id}/xperts/${xpertId}`, {})
  }

  removeXpert(id: string, xpertId: string) {
    return this.httpClient.delete(this.apiBaseUrl + `/${id}/xperts/${xpertId}`)
  }

  getToolsets(id: string, params: PaginationParams<IXpertToolset>) {
    return this.httpClient.get<{ items: IXpertToolset[]; total: number }>(this.apiBaseUrl + `/${id}/toolsets`, {params: toHttpParams(params)})
  }

  addToolset(id: string, toolsetId: string) {
    return this.httpClient.put(this.apiBaseUrl + `/${id}/toolsets/${toolsetId}`, {})
  }

  removeToolset(id: string, toolsetId: string) {
    return this.httpClient.delete(this.apiBaseUrl + `/${id}/toolsets/${toolsetId}`)
  }

  getMembers(id: string) {
    return this.httpClient.get<IUser[]>(this.apiBaseUrl + `/${id}/members`)
  }

  updateMembers(id: string, members: string[]) {
    return this.httpClient.put<IXpertProject>(this.apiBaseUrl + `/${id}/members`, members)
  }

  refreshTasks(id: string, threadId: string) {
    return this.httpClient.get<IXpertProjectTask[]>(this.apiBaseUrl + `/${id}/tasks`, {
      params: toHttpParams({
        where: {
          threadId
        },
        relations: ['steps']
      })
    })
  }

  getFiles(id: string) {
    return this.httpClient.get<IXpertProjectFile[]>(this.apiBaseUrl + `/${id}/files`)
  }

  deleteFile(id: string, fileId: string) {
    return this.httpClient.delete<void>(this.apiBaseUrl + `/${id}/file/${fileId}`)
  }
}

export function injectProjectService() {
  return inject(XpertProjectService)
}
