import { HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { OrganizationBaseCrudService, PaginationParams, toHttpParams } from '@xpert-ai/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject } from 'rxjs'
import { API_XPERT_AGENT_EXECUTION } from '../constants/app.constants'
import { IXpertAgentExecution, TXpertAgentExecutionCheckpoint } from '../types'
import { Store } from './store.service'

@Injectable({ providedIn: 'root' })
export class XpertAgentExecutionService extends OrganizationBaseCrudService<IXpertAgentExecution> {
  readonly #logger = inject(NGXLogger)
  readonly #store = inject(Store)

  readonly #refresh = new BehaviorSubject<void>(null)

  constructor() {
    super(API_XPERT_AGENT_EXECUTION)
  }

  getOneLog(id: string, options?: PaginationParams<IXpertAgentExecution>, organizationId?: string) {
    return this.httpClient.get<IXpertAgentExecution>(this.apiBaseUrl + `/${id}/log`, {
      params: appendOrganizationId(toHttpParams(options), organizationId)
    })
  }

  getOneState(id: string, checkpointId?: string, organizationId?: string) {
    return this.httpClient.get<Record<string, unknown>>(this.apiBaseUrl + `/${id}/state`, {
      params: (() => {
        let params = checkpointId ? new HttpParams().set('checkpointId', checkpointId) : null
        return appendOrganizationId(params, organizationId)
      })()
    })
  }

  getCheckpoints(id: string, organizationId?: string) {
    return this.httpClient.get<TXpertAgentExecutionCheckpoint[]>(this.apiBaseUrl + `/${id}/checkpoints`, {
      params: appendOrganizationId(null, organizationId)
    })
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

function appendOrganizationId(params: HttpParams | null, organizationId?: string) {
  if (!organizationId) {
    return params ?? undefined
  }

  return (params ?? new HttpParams()).set('organizationId', organizationId)
}
