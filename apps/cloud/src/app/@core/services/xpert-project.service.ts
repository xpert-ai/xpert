import { inject, Injectable } from '@angular/core'
import {
  IChatConversation,
  IKnowledgebase,
  IUser,
  IXpert,
  IXpertProjectTask,
  IXpertToolset,
  TFileDirectory,
} from '../types'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, switchMap } from 'rxjs'
import { API_XPERT_PROJECT } from '../constants/app.constants'
import { IXpertProject } from '../types'
import { OrganizationBaseCrudService, PaginationParams, toHttpParams } from '@metad/cloud/state'
import { toParams } from '@metad/core'

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

  getKnowledgebases(id: string, params: PaginationParams<IKnowledgebase>) {
    return this.httpClient.get<{ items: IKnowledgebase[]; total: number }>(this.apiBaseUrl + `/${id}/knowledges`, {params: toHttpParams(params)})
  }

  addKnowledgebase(id: string, kbId: string) {
    return this.httpClient.put(this.apiBaseUrl + `/${id}/knowledges/${kbId}`, {})
  }

  removeKnowledgebase(id: string, kbId: string) {
    return this.httpClient.delete(this.apiBaseUrl + `/${id}/knowledges/${kbId}`)
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

  duplicate(id: string) {
    return this.httpClient.post<IXpertProject>(this.apiBaseUrl + `/${id}/duplicate`, {})
  }

  exportDsl(id: string) {
    return this.httpClient.get<{data: string}>(this.apiBaseUrl + `/${id}/export`)
  }

  importDsl(dsl: {project: IXpertProject}) {
    return this.httpClient.post<IXpertProject>(this.apiBaseUrl + `/import`, dsl)
  }

  // Files
  uploadFile(id: string, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return this.httpClient.post(this.apiBaseUrl + `/${id}/file/upload`, formData, {
      observe: 'events',
      reportProgress: true,
    })
  }
  getFiles(id: string, path: string = '') {
    return this.httpClient.get<TFileDirectory[]>(this.apiBaseUrl + `/${id}/files`, {
      params: toParams({
        path
      })
    })
  }

  deleteFile(id: string, filePath: string) {
    return this.httpClient.delete<void>(this.apiBaseUrl + `/${id}/file`, {
      params: toParams({
        path: filePath
      })
    })
  }

  addAttachments(id: string, files: string[]) {
    return this.httpClient.put<void>(this.apiBaseUrl + `/${id}/attachments`, files)
  }
  removeAttachment(id: string, fileId: string) {
    return this.httpClient.delete<void>(this.apiBaseUrl + `/${id}/attachments/${fileId}`)
  }
  
}

export function injectProjectService() {
  return inject(XpertProjectService)
}
