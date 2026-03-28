import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import {
  AssistantCode,
  AssistantConfigScope,
  IAssistantConfig,
  IAssistantConfigUpsertInput,
  IResolvedAssistantConfig
} from '../types'
import { API_PREFIX } from '@metad/cloud/state'

const API_ASSISTANT_CONFIG = API_PREFIX + '/assistant-config'

@Injectable({ providedIn: 'root' })
export class AssistantConfigService {
  readonly #http = inject(HttpClient)

  getByScope(scope: AssistantConfigScope) {
    return this.#http.get<IAssistantConfig[]>(API_ASSISTANT_CONFIG, {
      params: {
        scope
      }
    })
  }

  getEffective(code: AssistantCode) {
    return this.#http.get<IResolvedAssistantConfig>(`${API_ASSISTANT_CONFIG}/effective/${code}`)
  }

  upsert(input: IAssistantConfigUpsertInput) {
    return this.#http.post<IAssistantConfig>(API_ASSISTANT_CONFIG, input)
  }

  delete(code: AssistantCode, scope: AssistantConfigScope) {
    return this.#http.delete(`${API_ASSISTANT_CONFIG}/${code}`, {
      params: {
        scope
      }
    })
  }
}
