import { computed, inject, Injectable } from '@angular/core'
import { SearchItem } from '@langchain/langgraph-checkpoint'
import { injectXpertPreferences, LanguagesEnum, LongTermMemoryTypeEnum, PaginationParams, TCopilotStore, timeRangeToParams, TMemoryQA, TMemoryUserProfile, toHttpParams } from '@metad/cloud/state'
import { toParams } from '@metad/ocap-angular/core'
import { HttpErrorResponse, HttpParams } from '@angular/common/http'
import { derivedFrom } from 'ngxtension/derived-from'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, catchError, map, Observable, pipe, tap, throwError } from 'rxjs'
import { API_XPERT_ROLE } from '../constants/app.constants'
import { injectApiBaseUrl, injectLanguage } from '../providers'
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
  TChatConversationLog,
  TChatOptions,
  TChatRequest,
  TDeleteResult,
  TWorkflowVarGroup,
  TXpertTeamDraft,
  XpertTypeEnum
} from '../types'
import { injectFetchEventSource } from './fetch-event-source'
import { XpertWorkspaceBaseCrudService } from './xpert-workspace.service'


export type TXpertVariablesOptions = {
  environmentId: string;
  xpertId: string;
  workflowKey?: string;
  agentKey?: string;
  type?: 'input' | 'output';
  isDraft?: boolean;
  connections: string[];
}


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

  getBySlug(slug: string) {
    return this.httpClient.get<IXpert>(this.apiBaseUrl + `/slug/${slug}`)
  }

  getTeam(id: string, options?: PaginationParams<IXpert>) {
    return this.httpClient.get<IXpert>(this.apiBaseUrl + `/${id}/team`, { params: toHttpParams(options) })
  }

  getVersions(id: string) {
    return this.httpClient.get<{ id: string; version: string; latest: boolean; publishAt: Date; releaseNotes: string }[]>(
      this.apiBaseUrl + `/${id}/version`
    )
  }

  setAsLatest(id: string) {
    return this.httpClient.post(this.apiBaseUrl + `/${id}/latest`, {})
  }

  saveDraft(id: string, draft: TXpertTeamDraft) {
    return this.httpClient.post<TXpertTeamDraft>(this.apiBaseUrl + `/${id}/draft`, draft)
  }

  upadteDraft(id: string, draft: TXpertTeamDraft) {
    return this.httpClient.put<TXpertTeamDraft>(this.apiBaseUrl + `/${id}/draft`, draft)
  }

  publish(id: string, newVersion: boolean, body: {environmentId: string; releaseNotes: string}) {
    return this.httpClient.post<IXpert>(this.apiBaseUrl + `/${id}/publish`, body, {
      params: new HttpParams().append('newVersion', newVersion)
    })
  }
  publishIntegration(id: string, integration: Partial<IIntegration>) {
    return this.httpClient.post<IIntegration>(this.apiBaseUrl + `/${id}/publish/integration`, integration)
  }
  removeIntegration(xpertId: string, id: string) {
    return this.httpClient.delete(this.apiBaseUrl + `/${xpertId}/publish/integration/${id}`)
  }

  validateName(name: string) {
    return this.httpClient.get<boolean>(this.apiBaseUrl + `/validate`, {
      params: toParams({ name })
    })
  }

  getDiagram(id: string, agentKey?: string) {
    let params = toParams({ isDraft: true })
    if (agentKey) {
      params = params.append('agentKey', agentKey)
    }
    return this.httpClient.get(this.apiBaseUrl + `/${id}/diagram`, {
      params,
      responseType: 'blob',
    }).pipe(
      catchError((error: HttpErrorResponse) => handleError(error))
    )
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

  exportDSL(id: string, params: {isDraft: boolean; includeMemory?: boolean}) {
    return this.httpClient.get<{ data: string }>(this.apiBaseUrl + `/${id}/export`, { params })
  }

  importDSL(dslObject: Record<string, any>) {
    return this.httpClient.post<IXpert>(this.apiBaseUrl + `/import`, dslObject)
  }

  duplicate(id: string, options: {basic: Partial<IXpert>; isDraft: boolean }) {
    return this.httpClient.post<IXpert>(this.apiBaseUrl + `/${id}/duplicate`, options)
  }

  getAllMemory(id: string, types: string[]) {
    return this.httpClient.get<{ items: ICopilotStore[] }>(this.apiBaseUrl + `/${id}/memory`, {
      params: {
        types: types?.join(':')
      }
    })
  }

  addMemory(id: string, memory: {type: LongTermMemoryTypeEnum; value: TMemoryQA | TMemoryUserProfile}) {
    return this.httpClient.post<TCopilotStore>(this.apiBaseUrl + `/${id}/memory`, memory)
  }
  bulkCreateMemories(id: string, body: { type: LongTermMemoryTypeEnum; memories: (TMemoryQA | TMemoryUserProfile)[]}) {
    return this.httpClient.post(this.apiBaseUrl + `/${id}/memory/bulk`, body)
  }
  searchMemory(id: string, body: { type: LongTermMemoryTypeEnum; text: string; isDraft: boolean }) {
    return this.httpClient.post<SearchItem[]>(this.apiBaseUrl + `/${id}/memory/search`, body)
  }

  clearMemory(id: string) {
    return this.httpClient.delete<TDeleteResult>(this.apiBaseUrl + `/${id}/memory`)
  }
  
  /**
   * Get avaiable variables for agent or global variables
   */
  getVariables(id: string, type: 'input' | 'output', options: {agentKey?: string; environmentId?: string; isDraft?: boolean}) {
    const { agentKey, environmentId, isDraft } = options
    let params = new HttpParams()
    if (environmentId) {
      params = params.append('environment', environmentId)
    }
    if (type) {
      params = params.append('type', type)
    }
    if (isDraft != null) {
      params = params.append('isDraft', isDraft)
    }
    return agentKey ? this.httpClient.get<TWorkflowVarGroup[]>(this.apiBaseUrl + `/${id}/agent/${agentKey}/variables`, {params})
    : this.httpClient.get<TWorkflowVarGroup[]>(this.apiBaseUrl + `/${id}/variables`, {params})
  }

  /**
   * Get avaiable variables for workflow node
   */
  getWorkflowVariables(id: string, nodeKey: string, environmentId?: string) {
    let params = new HttpParams()
    if (environmentId) {
      params = params.append('environment', environmentId)
    }
    return this.httpClient.get<TWorkflowVarGroup[]>(this.apiBaseUrl + `/${id}/workflow/${nodeKey}/variables`, {params})
  }

  getNodeVariables(options: TXpertVariablesOptions) {
    if (options.workflowKey) {
      return this.getWorkflowVariables(options.xpertId, options.workflowKey, options.environmentId)
    } else {
      return this.getVariables(options.xpertId, options.type, {
        agentKey: options.agentKey,
        environmentId: options.environmentId,
        isDraft: options.isDraft
      })
    }
  }

  getChatApp(slug: string) {
    return this.httpClient.get<IXpert>(
      this.apiBaseUrl + `/${slug}/app`,
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
  getConversations(id: string, options: PaginationParams<IChatConversation>, timeRange: string[]) {
    const params = toHttpParams(options)

    return this.httpClient.get<{items: TChatConversationLog[]; total: number;}>(this.apiBaseUrl + `/${id}/conversations`, {
      params: timeRangeToParams(params, timeRange)
    })
  }

  // Chat App

  chatApp(name: string, request: TChatRequest, options: TChatOptions) {
    return this.fetchEventSource(
      this.baseUrl + this.apiBaseUrl + `/${name}/chat-app`,
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

  getDailyConversations(id: string, timeRange: string[]) {
    return this.httpClient.get<{ date: string; count: number }[]>(this.apiBaseUrl + `/${id}/statistics/daily-conversations`, {
      params: timeRangeToParams(new HttpParams(), timeRange)
    })
  }

  getDailyEndUsers(id: string, timeRange: string[]) {
    return this.httpClient.get<{ date: string; count: number }[]>(this.apiBaseUrl + `/${id}/statistics/daily-end-users`, {
      params: timeRangeToParams(new HttpParams(),timeRange)
    })
  }

  getAverageSessionInteractions(id: string, timeRange: string[]) {
    return this.httpClient.get<{ date: string; count: number }[]>(this.apiBaseUrl + `/${id}/statistics/average-session-interactions`, {
      params: timeRangeToParams(new HttpParams(), timeRange)
    })
  }

  getDailyMessages(id: string, timeRange: string[]) {
    return this.httpClient.get<{ date: string; count: number }[]>(this.apiBaseUrl + `/${id}/statistics/daily-messages`, {
      params: timeRangeToParams(new HttpParams(), timeRange)
    })
  }
  
  getStatisticsTokensPerSecond(id: string, timeRange: string[]) {
    return this.httpClient.get<{ date: string; count: number }[]>(this.apiBaseUrl + `/${id}/statistics/tokens-per-second`, {
      params: timeRangeToParams(new HttpParams(), timeRange)
    })
  }

  getStatisticsTokenCost(id: string, timeRange: string[]) {
    return this.httpClient.get<{ date: string; tokens: number; price: number; model: string; currency: string;}[]>(this.apiBaseUrl + `/${id}/statistics/token-costs`, {
      params: timeRangeToParams(new HttpParams(), timeRange)
    })
  }
  
  getStatisticsUserSatisfactionRate(id: string, timeRange: string[]) {
    return this.httpClient.get<{ date: string; tokens: number; price: number; model: string; currency: string;}[]>(
      this.apiBaseUrl + `/${id}/statistics/user-satisfaction-rate`, {
      params: timeRangeToParams(new HttpParams(), timeRange)
    })
  }

  getStatisticsXperts(timeRange: string[]) {
    return this.httpClient.get<{ count: number;}[]>(
      this.apiBaseUrl + `/statistics/xperts`, {
      params: timeRangeToParams(new HttpParams(), timeRange)
    })
  }

  getStatisticsXpertConv(timeRange: string[]) {
    return this.httpClient.get<{ slug: string; count: number;}[]>(
      this.apiBaseUrl + `/statistics/xpert-conversations`, {
      params: timeRangeToParams(new HttpParams(), timeRange)
    })
  }

  getStatisticsXpertMessages(timeRange: string[]) {
    return this.httpClient.get<{ slug: string; count: number;}[]>(
      this.apiBaseUrl + `/statistics/xpert-messages`, {
      params: timeRangeToParams(new HttpParams(), timeRange)
    })
  }

  getStatisticsXpertTokens(timeRange: string[]) {
    return this.httpClient.get<{ slug: string; count: number;}[]>(
      this.apiBaseUrl + `/statistics/xpert-tokens`, {
      params: timeRangeToParams(new HttpParams(), timeRange)
    })
  }
  
  getStatisticsXpertIntegrations(timeRange: string[]) {
    return this.httpClient.get<{ slug: string; count: number;}[]>(
      this.apiBaseUrl + `/statistics/xpert-integrations`, {
      params: timeRangeToParams(new HttpParams(), timeRange)
    })
  }

}

export function injectXpertService() {
  return inject(XpertService)
}

/**
 * Handle blob error response
 * 
 * @param error 
 * @returns 
 */
function handleError(error: HttpErrorResponse): Observable<never> {
  if (error.error instanceof Blob) {
    return new Observable<never>((observer) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const errorMessage = JSON.parse(reader.result as string);
          observer.error(errorMessage);
        } catch (e) {
          observer.error({ message: 'Unknown error', details: reader.result });
        }
      };
      reader.onerror = () => {
        observer.error({ message: 'Failed to read error response' });
      };
      reader.readAsText(error.error);
    });
  } else {
    return throwError(() => error);
  }
}

export function injectXperts() {
  const xpertService = inject(XpertService)
  const preferences = injectXpertPreferences()
  const lang = injectLanguage()

  const _xperts = derivedFrom(
      [
        xpertService
          .getMyAll({
            relations: ['createdBy'],
            where: { type: XpertTypeEnum.Agent, latest: true },
            order: { createdAt: OrderTypeEnum.DESC }
          })
          .pipe(map(({ items }) => items)),
        lang
      ],
      pipe(
        map(([roles, lang]) => {
          if ([LanguagesEnum.SimplifiedChinese, LanguagesEnum.Chinese].includes(lang as LanguagesEnum)) {
            return roles?.map((role) => ({ ...role, title: role.titleCN || role.title }))
          } else {
            return roles
          }
        })
      ),
      { initialValue: null }
    )
    const _sortOrder = computed(() => preferences()?.sortOrder)
  
    const sortedXperts = computed(() => {
      const xperts = _xperts()
      const sortOrder = _sortOrder()
      if (xperts && sortOrder) {
        const sortOrderMap = new Map(sortOrder.map((id, index) => [id, index]))
        return [...xperts].sort(
          (a, b) =>
            (sortOrderMap.get(a.id) ?? 0) - (sortOrderMap.get(b.id) ?? 0) ||
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
      }
  
      return xperts
    })
  return sortedXperts
}