import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { PersonalApiKeyCreated, PersonalApiKeyCreateInput, PersonalApiKeySummary } from '@xpert-ai/contracts'
import { API_PREFIX } from '../state/constants'

@Injectable({ providedIn: 'root' })
export class PersonalApiKeysService {
  readonly #http = inject(HttpClient)
  readonly #url = `${API_PREFIX}/api-key/personal`

  list() {
    return this.#http.get<PersonalApiKeySummary[]>(this.#url)
  }
  create(input: PersonalApiKeyCreateInput) {
    return this.#http.post<PersonalApiKeyCreated>(this.#url, input)
  }
  revoke(id: string) {
    return this.#http.delete<void>(`${this.#url}/${encodeURIComponent(id)}`)
  }
}
