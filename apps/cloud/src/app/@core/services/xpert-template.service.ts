import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_PREFIX } from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { IXpertMCPTemplate, IXpertTemplate } from '../types'

@Injectable({ providedIn: 'root' })
export class XpertTemplateService {
  readonly #logger = inject(NGXLogger)
  readonly #httpClient = inject(HttpClient)

  getAll() {
    return this.#httpClient.get<{categories: string[]; recommendedApps: IXpertTemplate[]}>(API_PREFIX + `/xpert-template`)
  }

  getTemplate(id: string) {
    return this.#httpClient.get<IXpertTemplate>(API_PREFIX + `/xpert-template/${id}`)
  }

  getAllMCP() {
    return this.#httpClient.get<{categories: string[]; templates: IXpertMCPTemplate[]}>(API_PREFIX + `/xpert-template/mcps`)
  }
}
