import { inject, Injectable } from '@angular/core'
import { SearchItem } from '@langchain/langgraph-checkpoint'
import { PaginationParams, toHttpParams } from '@metad/cloud/state'
import { toParams } from '@metad/ocap-angular/core'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, tap } from 'rxjs'
import { API_XPERT_ROLE } from '../constants/app.constants'
import { injectApiBaseUrl } from '../providers'
import {
  IChatConversation,
  IChatMessageFeedback,
  ICopilotStore,
  IIntegration,
  IUser,
  IXpert,
  IXpertAgentExecution,
  OrderTypeEnum,
  TChatApi,
  TChatApp,
  TChatOptions,
  TChatRequest,
  TDeleteResult,
  TStateVariable,
  TXpertTeamDraft,
  XpertTypeEnum
} from '../types'
import { injectFetchEventSource } from './fetch-event-source'
import { XpertWorkspaceBaseCrudService } from './xpert-workspace.service'

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
    return this.httpClient.get<{ id: string; version: string; latest: boolean; publishAt: Date }[]>(
      this.apiBaseUrl + `/${id}/version`
    )
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
  publishIntegration(id: string, integration: Partial<IIntegration>) {
    return this.httpClient.post<IIntegration>(this.apiBaseUrl + `/${id}/publish/integration`, integration)
  }
  removeIntegration(xpertId: string, id: string) {
    return this.httpClient.delete(this.apiBaseUrl + `/${xpertId}/publish/integration/${id}`)
  }

  validateTitle(title: string) {
    return this.httpClient.get<IXpert[]>(this.apiBaseUrl + `/validate`, {
      params: toParams({ title })
    })
  }

  getExecutions(id: string, options?: PaginationParams<IXpertAgentExecution>) {
    return this.httpClient.get<{ items: IXpertAgentExecution[] }>(this.apiBaseUrl + `/${id}/executions`, {
      params: toHttpParams(options)
    })
  }

  chat(id: string, request: TChatRequest, options: { isDraft: boolean }) {
    return this.fetchEventSource(this.baseUrl + this.apiBaseUrl + `/${id}/chat`, JSON.stringify({ request, options }))
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

  getMyCopilots(relations?: string[]) {
    return this.getMyAll({
      relations,
      where: { latest: true, type: XpertTypeEnum.Copilot },
      order: { updatedAt: OrderTypeEnum.DESC }
    })
  }

  exportDSL(id: string, isDraft: boolean) {
    return this.httpClient.get<{ data: string }>(this.apiBaseUrl + `/${id}/export`, { params: { isDraft } })
  }

  importDSL(dslObject: Record<string, any>) {
    return this.httpClient.post(this.apiBaseUrl + `/import`, dslObject)
  }

  getAllMemory(id: string, types: string[]) {
    return this.httpClient.get<{ items: ICopilotStore[] }>(this.apiBaseUrl + `/${id}/memory`, {
      params: {
        types: types?.join(':')
      }
    })
  }
  searchMemory(id: string, body: { text: string; isDraft: boolean }) {
    return this.httpClient.post<SearchItem[]>(this.apiBaseUrl + `/${id}/memory/search`, body)
  }

  clearMemory(id: string) {
    return this.httpClient.delete<TDeleteResult>(this.apiBaseUrl + `/${id}/memory`)
  }

  getVariables(id: string, agentKey: string) {
    return this.httpClient.get<TStateVariable[]>(this.apiBaseUrl + `/${id}/agent/${agentKey}/variables`)
  }

  getChatApp(id: string) {
    return this.httpClient.get<{ user: IUser; token: string; refreshToken: string; xpert: IXpert }>(
      this.apiBaseUrl + `/${id}/app`,
      { withCredentials: true }
    )
  }

  updateChatApi(id: string, api: Partial<TChatApi>) {
    return this.httpClient.put<void>(this.apiBaseUrl + `/${id}/api`, api)
  }

  updateChatApp(id: string, app: Partial<TChatApp>) {
    return this.httpClient.put<void>(this.apiBaseUrl + `/${id}/app`, app)
  }

  // Conversations
  getConversations(id: string, options: PaginationParams<IChatConversation>) {
    return this.httpClient.get<{items: IChatConversation[]; total: number;}>(this.apiBaseUrl + `/${id}/conversations`, {
      params: toHttpParams(options)
    })
  }

  // Chat App

  chatApp(name: string, request: TChatRequest, options: TChatOptions) {
    return this.fetchEventSource(
      this.apiBaseUrl + `/${name}/chat-app`,
      JSON.stringify({
        request,
        options
      })
    )
  }

  getAppConversation(name: string, id: string, options: PaginationParams<IChatConversation>) {
    return this.httpClient.get<IChatConversation>(this.apiBaseUrl + `/${name}/conversation/${id}`, {
      withCredentials: true,
      params: toHttpParams(options)
    })
  }

  getAppConversations(name: string, options: PaginationParams<IChatConversation>) {
    return this.httpClient.get<{ items: IChatConversation[]; total: number }>(
      this.apiBaseUrl + `/${name}/conversation`,
      {
        withCredentials: true,
        params: toHttpParams(options)
      }
    )
  }

  deleteAppConversation(name: string, id: string) {
    return this.httpClient.delete<IChatConversation>(this.apiBaseUrl + `/${name}/conversation/${id}`, {
      withCredentials: true
    })
  }

  updateAppConversation(name: string, id: string, entity: Partial<IChatConversation>) {
    return this.httpClient.put<void>(this.apiBaseUrl + `/${name}/conversation/${id}`, entity, {
      withCredentials: true
    })
  }

  getAppFeedbacks(name: string, id: string) {
    return this.httpClient.get<{ items: IChatMessageFeedback[]; total: number }>(
      this.apiBaseUrl + `/${name}/conversation/${id}/feedbacks`,
      {
        withCredentials: true
      }
    )
  }

  // Statistics

  getDailyConversations(id: string, timeRange: [string, string]) {
    return this.httpClient.get<{ date: string; count: number }[]>(this.apiBaseUrl + `/${id}/statistics/daily-conversations`, {
      params: {
        start: timeRange[0],
        end: timeRange[1]
      }
    })
  }

  getDailyEndUsers(id: string, timeRange: [string, string]) {
    return this.httpClient.get<{ date: string; count: number }[]>(this.apiBaseUrl + `/${id}/statistics/daily-end-users`, {
      params: {
        start: timeRange[0],
        end: timeRange[1]
      }
    })
  }

  getAverageSessionInteractions(id: string, timeRange: [string, string]) {
    return this.httpClient.get<{ date: string; count: number }[]>(this.apiBaseUrl + `/${id}/statistics/average-session-interactions`, {
      params: {
        start: timeRange[0],
        end: timeRange[1]
      }
    })
  }
}

export function injectXpertService() {
  return inject(XpertService)
}
