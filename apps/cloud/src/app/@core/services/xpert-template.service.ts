import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_PREFIX, PaginationParams, toHttpParams } from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { IXpertMCPTemplate, IXpertTemplate, TXpertTemplate } from '../types'

@Injectable({ providedIn: 'root' })
export class XpertTemplateService {
  readonly #logger = inject(NGXLogger)
  readonly #httpClient = inject(HttpClient)

  getAll() {
    return this.#httpClient.get<{categories: string[]; recommendedApps: TXpertTemplate[]}>(API_PREFIX + `/xpert-template`)
  }

  getTemplate(id: string) {
    return this.#httpClient.get<TXpertTemplate>(API_PREFIX + `/xpert-template/${id}`)
  }

  getAllMCP(paginationParams: PaginationParams<IXpertTemplate>) {
    return this.#httpClient.get<{categories: string[]; templates: IXpertMCPTemplate[]}>(API_PREFIX + `/xpert-template/mcps`, {
      params: toHttpParams(paginationParams)
    })
  }

  getMCPTemplate(id: string) {
    return this.#httpClient.get<IXpertMCPTemplate>(API_PREFIX + `/xpert-template/mcps/${id}`)
  }
}
