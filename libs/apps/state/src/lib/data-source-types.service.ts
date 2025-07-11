import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { IDataSourceType } from '@metad/contracts'
import { map, shareReplay } from 'rxjs/operators'
import { API_DATA_SOURCE_TYPE } from './constants'

/**
 */
@Injectable({
  providedIn: 'root'
})
export class DataSourceTypesService {
  readonly #httpClient = inject(HttpClient)

  readonly types$ = this.getAll().pipe(shareReplay(1))

  getAll() {
    return this.#httpClient.get<{ items: Array<IDataSourceType>; total: number; }>(API_DATA_SOURCE_TYPE)
      .pipe(map(({ items }) => items))
  }

  sync() {
    return this.#httpClient.post(API_DATA_SOURCE_TYPE + '/sync', {})
  }
}
