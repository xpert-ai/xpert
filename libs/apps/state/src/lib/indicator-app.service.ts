import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { IIndicatorApp } from '@xpert-ai/contracts'
import { map } from 'rxjs/operators'
import { C_URI_API_INDICATOR_APP } from './constants'

@Injectable({
  providedIn: 'root'
})
export class IndicatorAppService {
  readonly httpClient = inject(HttpClient)

  getMy(relations = []) {
    const query = JSON.stringify({ relations })
    const params = new HttpParams().append('$query', query)
    return this.httpClient
      .get<{ items: IIndicatorApp[] }>(C_URI_API_INDICATOR_APP + '/me', { params })
      .pipe(map(({ items }) => items))
  }

  upsert(input: Partial<IIndicatorApp>) {
    return input.id
      ? this.httpClient.put<IIndicatorApp>(C_URI_API_INDICATOR_APP + `/${input.id}`, input)
      : this.httpClient.post<IIndicatorApp>(C_URI_API_INDICATOR_APP, input)
  }

  delete(id: string) {
    return this.httpClient.delete(C_URI_API_INDICATOR_APP + `/${id}`)
  }
}
