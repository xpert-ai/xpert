import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { IIndicator, PaginationParams, TIndicatorDraft } from '@metad/contracts'
import { map } from 'rxjs/operators'
import { C_URI_API_INDICATORS } from './constants'
import { Indicator, convertIndicator } from './types'
import { toHttpParams } from './crud.service'


@Injectable({
  providedIn: 'root'
})
export class IndicatorsService {
  constructor(private httpClient: HttpClient) {}

  getAll(params: PaginationParams<IIndicator>) {
    return this.httpClient
      .get<{ items: IIndicator[]; total: number }>(C_URI_API_INDICATORS, { params: toHttpParams(params) })
  }

  getAllView(relations = []) {
    const params = new HttpParams().append('$query', JSON.stringify({ relations }))
    return this.httpClient
      .get<{ items: IIndicator[]; total: number }>(C_URI_API_INDICATORS + `/view`, { params })
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

  // _create(input: Partial<Indicator>) {
  //   return this.httpClient.post(C_URI_API_INDICATORS, convertIndicator(input)).pipe(map(convertIndicatorResult)) as any
  // }

  create(input: Partial<IIndicator>) {
    return this.httpClient.post<IIndicator>(C_URI_API_INDICATORS, input)
  }

  delete(id: string) {
    return this.httpClient.delete(C_URI_API_INDICATORS + `/${id}`)
  }
  
  count() {
    return this.httpClient.get<number>(C_URI_API_INDICATORS + `/count`)
  }

  createBulk(input: Array<Partial<IIndicator>>) {
    return this.httpClient.post<IIndicator[]>(C_URI_API_INDICATORS + '/bulk', input)
  }

  saveDraft(id: string, draft: Partial<Indicator>) {
    return this.httpClient.post<IIndicator>(C_URI_API_INDICATORS + `/${id}/draft`, convertIndicator(draft))
  }

  updateDraft(id: string, draft: TIndicatorDraft) {
    return this.httpClient.put<IIndicator>(C_URI_API_INDICATORS + `/${id}/draft`, draft)
  }

  publish(id: string) {
    return this.httpClient.post<void>(C_URI_API_INDICATORS + `/${id}/publish`, {})
  }

  embedding(id: string) {
    return this.httpClient.post<IIndicator>(C_URI_API_INDICATORS + `/${id}/embedding`, {})
  }

  startEmbedding(projectId: string) {
    return this.httpClient.post<void>(C_URI_API_INDICATORS + `/project/${projectId}/embedding`, {})
  }
}
