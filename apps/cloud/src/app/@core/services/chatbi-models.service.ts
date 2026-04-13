import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService } from '@xpert-ai/cloud/state'
import { IChatBIModel } from '@xpert-ai/contracts'
import { NGXLogger } from 'ngx-logger'

const API_CHATBI_MODELS = API_PREFIX + '/chatbi-model'

@Injectable({ providedIn: 'root' })
export class ChatBIModelService extends OrganizationBaseCrudService<IChatBIModel> {
  readonly #logger = inject(NGXLogger)
  readonly httpClient = inject(HttpClient)

  constructor() {
    super(API_CHATBI_MODELS)
  }

  updateRoles(id: string, roles: string[]) {
    return this.httpClient.put<IChatBIModel>(this.apiBaseUrl + '/' + id + '/roles', { roles })
  }
}
