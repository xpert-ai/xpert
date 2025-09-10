import { inject, Injectable } from '@angular/core'
import { OrganizationBaseCrudService, PaginationParams, toHttpParams } from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject } from 'rxjs'
import { API_XPERT_AGENT_EXECUTION } from '../constants/app.constants'
import { IXpertAgentExecution } from '../types'
import { Store } from './store.service'

@Injectable({ providedIn: 'root' })
export class XpertAgentExecutionService extends OrganizationBaseCrudService<IXpertAgentExecution> {
  readonly #logger = inject(NGXLogger)
  readonly #store = inject(Store)

  readonly #refresh = new BehaviorSubject<void>(null)

  constructor() {
    super(API_XPERT_AGENT_EXECUTION)
  }

  getOneLog(id: string, options?: PaginationParams<IXpertAgentExecution>) {
    return this.httpClient.get<IXpertAgentExecution>(this.apiBaseUrl + `/${id}/log`, {
      params: toHttpParams(options)
    })
  }

  getOneState(id: string) {
    return this.httpClient.get<IXpertAgentExecution>(this.apiBaseUrl + `/${id}/state`)
  }

  findAllByXpertAgent(xpertId: string, agentKey: string, options: PaginationParams<IXpertAgentExecution>) {
    return this.httpClient.get<{ items: IXpertAgentExecution[] }>(
      this.apiBaseUrl + `/xpert/${xpertId}/agent/${agentKey}`,
      {
        params: toHttpParams(options)
      }
    )
  }
}
