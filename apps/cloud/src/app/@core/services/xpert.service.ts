import { inject, Injectable } from '@angular/core'
import { PaginationParams, toHttpParams } from '@metad/cloud/state'
import { toParams } from '@metad/ocap-angular/core'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, tap } from 'rxjs'
import { API_XPERT_ROLE } from '../constants/app.constants'
import { IUser, IXpert, IXpertAgentExecution, OrderTypeEnum, TChatRequest, TXpertTeamDraft, XpertTypeEnum } from '../types'
import { XpertWorkspaceBaseCrudService } from './xpert-workspace.service'
import { injectApiBaseUrl } from '../providers'
import { injectFetchEventSource } from './fetch-event-source'

@Injectable({ providedIn: 'root' })
export class XpertService extends XpertWorkspaceBaseCrudService<IXpert> {
  readonly #logger = inject(NGXLogger)
  readonly baseUrl = injectApiBaseUrl()
  readonly fetchEventSource = injectFetchEventSource()

  readonly #refresh = new BehaviorSubject<void>(null)

  constructor() {
    super(API_XPERT_ROLE)
  }

  create(entity: Partial<IXpert>) {
    return this.httpClient.post<IXpert>(this.apiBaseUrl, entity).pipe(tap(() => this.refresh()))
  }

  update(id: string, entity: Partial<IXpert>) {
    return this.httpClient.put<IXpert>(this.apiBaseUrl + `/${id}`, entity).pipe(tap(() => this.refresh()))
  }

  delete(id: string) {
    return this.httpClient.delete(this.apiBaseUrl + `/${id}`).pipe(tap(() => this.refresh()))
  }

  refresh() {
    this.#refresh.next()
  }

  getTeam(id: string, options?: PaginationParams<IXpert>) {
    return this.httpClient.get<IXpert>(this.apiBaseUrl + `/${id}/team`, { params: toHttpParams(options) })
  }

  getVersions(id: string) {
    return this.httpClient.get<{ id: string; version: string; latest: boolean; publishAt: Date; }[]>(this.apiBaseUrl + `/${id}/version`)
  }

  saveDraft(id: string, draft: TXpertTeamDraft) {
    return this.httpClient.post<TXpertTeamDraft>(this.apiBaseUrl + `/${id}/draft`, draft)
  }

  upadteDraft(id: string, draft: TXpertTeamDraft) {
    return this.httpClient.put<TXpertTeamDraft>(this.apiBaseUrl + `/${id}/draft`, draft)
  }

  publish(id: string) {
    return this.httpClient.post<IXpert>(this.apiBaseUrl + `/${id}/publish`, {})
  }

  validateTitle(title: string) {
    return this.httpClient.get<IXpert[]>(this.apiBaseUrl + `/validate`, {
      params: toParams({ title })
    })
  }

  getExecutions(id: string, options?: PaginationParams<IXpertAgentExecution>) {
    return this.httpClient.get<{items: IXpertAgentExecution[]}>(this.apiBaseUrl + `/${id}/executions`, { params: toHttpParams(options) })
  }

  chat(id: string, request: TChatRequest, options: { isDraft: boolean; }) {
    return this.fetchEventSource(this.baseUrl + this.apiBaseUrl + `/${id}/chat`, JSON.stringify({request, options}))
  }

  getXpertManagers(id: string) {
    return this.httpClient.get<IUser[]>(this.apiBaseUrl + `/${id}/managers`)
  }

  updateXpertManagers(id: string, managers: string[]) {
    return this.httpClient.put<IUser[]>(this.apiBaseUrl + `/${id}/managers`, managers)
  }

  removeXpertManager(id: string, userId: string) {
    return this.httpClient.delete<void>(this.apiBaseUrl + `/${id}/managers/${userId}`)
  }

  getMyAll(params: PaginationParams<IXpert>) {
    return this.httpClient.get<{items: IXpert[]}>(this.apiBaseUrl + `/my`, { params: toHttpParams(params) })
  }

  getMyCopilots(relations?: string[]) {
    return this.getMyAll({ relations, where: {latest: true, type: XpertTypeEnum.Copilot }, order: {updatedAt: OrderTypeEnum.DESC} })
  }

  exportDSL(id: string, isDraft: boolean) {
    return this.httpClient.get<{data: string;}>(this.apiBaseUrl + `/${id}/export`, {params: {isDraft}})
  }

  importDSL(dslObject: Record<string, any>) {
    return this.httpClient.post(this.apiBaseUrl + `/import`, dslObject)
  }
}

export function injectXpertService() {
  return inject(XpertService)
}

export function convertToUrlPath(title: string) {
  return title
    ?.toLowerCase() // 转换为小写
    .replace(/\s+/g, '-') // 替换空格为 -
    .replace(/[^a-z0-9-]/g, '') // 移除非字母数字字符
}
