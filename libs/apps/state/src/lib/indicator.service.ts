import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { IIndicator, PaginationParams } from '@metad/contracts'
import { map } from 'rxjs/operators'
import { C_URI_API_INDICATORS } from './constants'
import { Indicator, convertIndicator, convertIndicatorResult } from './types'
import { toHttpParams } from './crud.service'


@Injectable({
  providedIn: 'root'
})
export class IndicatorsService {
  constructor(private httpClient: HttpClient) {}

  getAll(relations = []) {
    const params = new HttpParams().append('$query', JSON.stringify({ relations }))
    return this.httpClient
      .get<{ items: IIndicator[]; total: number }>(C_URI_API_INDICATORS, { params })
      .pipe(map(({ items }) => items))
  }

  getMy(relations = []) {
    const query = JSON.stringify({ relations })
    const params = new HttpParams().append('$query', query)
    return this.httpClient
      .get<{ items: IIndicator[] }>(C_URI_API_INDICATORS + '/my', { params })
      .pipe(map(({ items }) => items))
  }

  getByProject(projectId: string, params: PaginationParams<IIndicator> ) {
    return this.httpClient.get<{ items: IIndicator[]; total: number }>(C_URI_API_INDICATORS + `/project/${projectId}`, { params: toHttpParams(params) })
  }

  getApp(relations = []) {
    const query = JSON.stringify({ relations })
    const params = new HttpParams().append('$query', query)
    return this.httpClient
      .get<{ items: IIndicator[] }>(C_URI_API_INDICATORS + '/app', { params })
      .pipe(map(({ items }) => items))
  }

  getById(id: string, relations = []) {
    const query = JSON.stringify({ relations })
    const params = new HttpParams().append('$query', query)
    return this.httpClient.get<IIndicator>(C_URI_API_INDICATORS + `/${id}`, { params })
  }

  create(input: Partial<Indicator>) {
    return this.httpClient.post(C_URI_API_INDICATORS, convertIndicator(input)).pipe(map(convertIndicatorResult))
  }

  delete(id: string) {
    return this.httpClient.delete(C_URI_API_INDICATORS + `/${id}`)
  }
  
  count() {
    return this.httpClient.get<number>(C_URI_API_INDICATORS + `/count`)
  }

  createBulk(input: Array<Partial<Indicator>>) {
    return this.httpClient.post<Indicator[]>(C_URI_API_INDICATORS + '/bulk', input.map(convertIndicator))
      .pipe(map((items) => items.map(convertIndicatorResult)))
  }

  startEmbedding(projectId: string) {
    return this.httpClient.post<void>(C_URI_API_INDICATORS + `/project/${projectId}/embedding`, {})
  }
}
