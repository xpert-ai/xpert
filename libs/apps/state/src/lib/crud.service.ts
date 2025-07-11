import { HttpClient, HttpParams } from '@angular/common/http'
import { inject } from '@angular/core'
import { PaginationParams } from '@metad/contracts'
export {PaginationParams}



export class CrudService<T> {
  protected readonly httpClient = inject(HttpClient)

  constructor(protected apiBaseUrl: string) {}

  getAll(options?: PaginationParams<T>) {
    return this.httpClient
      .get<{ items: T[]; total: number }>(this.apiBaseUrl, { params: toHttpParams(options) })
  }

  getMyAll(options?: PaginationParams<T>) {
    return this.httpClient
      .get<{ items: T[]; total: number }>(this.apiBaseUrl + '/my', { params: toHttpParams(options) })
  }

  getById(id: string, options?: {select?: (keyof T)[]; relations?: string[]}) {
    return this.httpClient.get<T>(this.apiBaseUrl + `/${id}`, { params: toHttpParams(options) })
  }

  create(entity: Partial<T>) {
    return this.httpClient.post<T>(this.apiBaseUrl, entity)
  }

  update(id: string, entity: Partial<T>) {
    return this.httpClient.put(`${this.apiBaseUrl}/${id}`, entity)
  }

  upsert(entity: Partial<T>) {
    if (entity['id']) {
      return this.update(entity['id'], entity)
    } else {
      return this.create(entity)
    }
  }

  delete(id: string) {
    return this.httpClient.delete(`${this.apiBaseUrl}/${id}`)
  }

  softDelete(id: string) {
    return this.httpClient.delete(`${this.apiBaseUrl}/${id}/soft`)
  }

  softRecover(id: string) {
    return this.httpClient.put(`${this.apiBaseUrl}/${id}/recover`, {})
  }
}

export function toHttpParams(options: PaginationParams<any>) {
  if (!options) {
    return null
  }
  const { select, where, relations, order, take, skip } = options
  let params = new HttpParams()
  if (select) {
    params = params.append('$select', JSON.stringify(select))
  }
  if (where) {
    params = params.append('$where', JSON.stringify(where))
  }
  if (relations?.length > 0) {
    params = params.append('$relations', JSON.stringify(relations))
  }
  if (order) {
    params = params.append('$order', JSON.stringify(order))
  }
  if (take != null) {
    params = params.append('$take', take)
  }
  if (skip != null) {
    params = params.append('$skip', skip)
  }

  return params.append('data', JSON.stringify(options))
}