import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import type { XpertFrequentQuestionsResponse } from '@xpert-ai/contracts'
import { API_XPERT_ROLE } from '../constants/app.constants'

@Injectable({ providedIn: 'root' })
export class XpertFrequentQuestionsService {
  readonly #http = inject(HttpClient)

  get(xpertId: string, locale: string) {
    return this.#http.get<XpertFrequentQuestionsResponse>(`${API_XPERT_ROLE}/${xpertId}/frequent-questions`, {
      params: { locale }
    })
  }
}
