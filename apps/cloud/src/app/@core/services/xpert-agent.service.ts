import { inject, Injectable } from '@angular/core'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject } from 'rxjs'
import { API_XPERT_AGENT } from '../constants/app.constants'
import { injectApiBaseUrl } from '../providers'
import { IXpertAgent, TChatAgentParams } from '../types'
import { XpertWorkspaceBaseCrudService } from './xpert-workspace.service'
import { injectFetchEventSource } from './fetch-event-source'

@Injectable({ providedIn: 'root' })
export class XpertAgentService extends XpertWorkspaceBaseCrudService<IXpertAgent> {
  readonly #logger = inject(NGXLogger)
  readonly baseUrl = injectApiBaseUrl()
  readonly fetchEventSource = injectFetchEventSource()

  readonly #refresh = new BehaviorSubject<void>(null)

  constructor() {
    super(API_XPERT_AGENT)
  }

  chatAgent(data: TChatAgentParams) {
    return this.fetchEventSource(this.baseUrl + this.apiBaseUrl + `/chat`, JSON.stringify({
      ...data,
    }))
  }

  test(xpertId: string, nodeKey: string, parameters: any) {
    return this.httpClient.post(this.apiBaseUrl + `/xpert/${xpertId}/test/${nodeKey}`, {parameters})
  }
}
