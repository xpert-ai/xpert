import { inject, Injectable } from '@angular/core'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, shareReplay, switchMap } from 'rxjs'
import { API_XPERT_AGENT } from '../constants/app.constants'
import { injectApiBaseUrl } from '../providers'
import { IXpertAgent, JsonSchemaObjectType, TAgentMiddlewareMeta, TXpertAgentChatRequest } from '../types'
import { injectFetchEventSource } from './fetch-event-source'
import { XpertWorkspaceBaseCrudService } from './xpert-workspace.service'

@Injectable({ providedIn: 'root' })
export class XpertAgentService extends XpertWorkspaceBaseCrudService<IXpertAgent> {
  readonly #logger = inject(NGXLogger)
  readonly baseUrl = injectApiBaseUrl()
  readonly fetchEventSource = injectFetchEventSource()

  readonly #refresh$ = new BehaviorSubject<void>(null)

  readonly agentMiddlewares$ = this.#refresh$.pipe(
    switchMap(() => this.getAgentMiddlewareStrategies()),
    shareReplay(1)
  )

  constructor() {
    super(API_XPERT_AGENT)
  }

  chatAgent(data: TXpertAgentChatRequest) {
    return this.fetchEventSource(
      this.baseUrl + this.apiBaseUrl + `/chat`,
      JSON.stringify({
        ...data
      })
    )
  }

  test(xpertId: string, nodeKey: string, state: any) {
    return this.httpClient.post(this.apiBaseUrl + `/xpert/${xpertId}/test/${nodeKey}`, { state })
  }

  getAgentMiddlewareStrategies() {
    return this.httpClient.get<{ meta: TAgentMiddlewareMeta }[]>(this.apiBaseUrl + `/middlewares`)
  }

  getAgentMiddleware(provider: string, options: any) {
    return this.httpClient.post<{
      stateSchema?: JsonSchemaObjectType
      tools: { name: string; description?: string; schema: JsonSchemaObjectType }[]
    }>(this.apiBaseUrl + `/middlewares/${provider}/tools`, options)
  }

  /**
   * Refresh cached strategy data (e.g., after plugin install/uninstall)
   */
  refresh() {
    this.#refresh$.next()
  }

  testAgentMiddlewareTool(provider: string, toolName: string, options: any, parameters: Record<string, any>) {
    return this.httpClient.post(this.apiBaseUrl + `/middlewares/${provider}/tools/${toolName}/test`, {
      options,
      parameters
    })
  }
}

export function injectXpertAgentAPI() {
  return inject(XpertAgentService)
}
