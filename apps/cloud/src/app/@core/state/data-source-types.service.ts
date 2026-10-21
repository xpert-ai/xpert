import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { IDataSourceType } from '@xpert-ai/contracts'
import { map, shareReplay, switchMap, tap } from 'rxjs/operators'
import { BehaviorSubject } from 'rxjs'
import { API_DATA_SOURCE_TYPE } from './constants'

/**
 */
@Injectable({
  providedIn: 'root'
})
export class DataSourceTypesService {
  readonly #httpClient = inject(HttpClient)

  private readonly refresh = new BehaviorSubject(0)
  readonly types$ = this.refresh.pipe(
    switchMap(() => this.getAll()),
    shareReplay({ bufferSize: 1, refCount: true })
  )

  getAll() {
    return this.#httpClient
      .get<{ items: Array<IDataSourceType>; total: number }>(API_DATA_SOURCE_TYPE)
      .pipe(map(({ items }) => items))
  }

  sync() {
    return this.#httpClient
      .post(API_DATA_SOURCE_TYPE + '/sync', {})
      .pipe(tap(() => this.refresh.next(this.refresh.value + 1)))
  }
}
