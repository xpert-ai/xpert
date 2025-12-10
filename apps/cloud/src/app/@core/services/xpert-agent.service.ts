import { inject, Injectable } from '@angular/core'
import { NGXLogger } from 'ngx-logger'
import { shareReplay } from 'rxjs'
import { API_XPERT_AGENT } from '../constants/app.constants'
import { injectApiBaseUrl } from '../providers'
import { IXpertAgent, JsonSchemaObjectType, TAgentMiddlewareMeta, TChatAgentParams } from '../types'
import { XpertWorkspaceBaseCrudService } from './xpert-workspace.service'
import { injectFetchEventSource } from './fetch-event-source'

@Injectable({ providedIn: 'root' })
export class XpertAgentService extends XpertWorkspaceBaseCrudService<IXpertAgent> {
  readonly #logger = inject(NGXLogger)
  readonly baseUrl = injectApiBaseUrl()
  readonly fetchEventSource = injectFetchEventSource()

  readonly agentMiddlewares$ = this.getAgentMiddlewareStrategies().pipe(shareReplay(1))

  constructor() {
    super(API_XPERT_AGENT)
  }

  chatAgent(data: TChatAgentParams) {
    return this.fetchEventSource(this.baseUrl + this.apiBaseUrl + `/chat`, JSON.stringify({
      ...data,
    }))
  }

  test(xpertId: string, nodeKey: string, state: any) {
    return this.httpClient.post(this.apiBaseUrl + `/xpert/${xpertId}/test/${nodeKey}`, {state})
  }

  getAgentMiddlewareStrategies() {
    return this.httpClient.get<{meta: TAgentMiddlewareMeta}[]>(this.apiBaseUrl + `/middlewares`)
  }

  getAgentMiddlewareTools(provider: string, options: any) {
    return this.httpClient.post<{name: string; description?: string; schema: JsonSchemaObjectType}[]>(this.apiBaseUrl + `/middlewares/${provider}/tools`, options)
  }
}

export function injectXpertAgentAPI() {
  return inject(XpertAgentService)
}