import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { map } from 'rxjs'
import {
  AssistantBindingScope,
  AssistantCode,
  IAssistantBinding,
  IAssistantBindingUpsertInput,
  IPagination,
  IResolvedAssistantBinding,
  IXpert
} from '../types'
import { API_PREFIX } from '@metad/cloud/state'

const API_ASSISTANT_BINDING = API_PREFIX + '/assistant-binding'

@Injectable({ providedIn: 'root' })
export class AssistantBindingService {
  readonly #http = inject(HttpClient)

  getByScope(scope: AssistantBindingScope) {
    return this.#http.get<IAssistantBinding[]>(API_ASSISTANT_BINDING, {
      params: {
        scope
      }
    })
  }

  get(code: AssistantCode, scope: AssistantBindingScope) {
    return this.#http.get<IAssistantBinding | null>(`${API_ASSISTANT_BINDING}/${code}`, {
      params: {
        scope
      }
    })
  }

  getEffective(code: AssistantCode) {
    return this.#http.get<IResolvedAssistantBinding>(`${API_ASSISTANT_BINDING}/effective/${code}`)
  }

  getAvailableXperts(scope: AssistantBindingScope, code: AssistantCode) {
    return this.#http
      .get<IXpert[] | IPagination<IXpert>>(`${API_ASSISTANT_BINDING}/xperts`, {
        params: {
          scope,
          code
        }
      })
      .pipe(map((response) => unwrapAssistantBindingItems(response)))
  }

  upsert(input: IAssistantBindingUpsertInput) {
    return this.#http.post<IAssistantBinding>(API_ASSISTANT_BINDING, input)
  }

  delete(code: AssistantCode, scope: AssistantBindingScope) {
    return this.#http.delete(`${API_ASSISTANT_BINDING}/${code}`, {
      params: {
        scope
      }
    })
  }
}

function unwrapAssistantBindingItems<T>(response: T[] | IPagination<T> | null | undefined): T[] {
  if (Array.isArray(response)) {
    return response
  }

  return Array.isArray(response?.items) ? response.items : []
}
