import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { BusinessType, IFavorite } from '@xpert-ai/contracts'
import { map, switchMap } from 'rxjs/operators'
import { C_URI_API_FAVORITES } from './constants'
import { OrganizationBaseService } from './organization-base.service'

@Injectable({
  providedIn: 'root'
})
export class FavoritesService extends OrganizationBaseService {
  constructor(public httpClient: HttpClient) {
    super()
  }

  getAll() {
    const params = new HttpParams()
    return this.httpClient
      .get<{ items: IFavorite[]; total: number }>(C_URI_API_FAVORITES, { params })
      .pipe(map(({ items }) => items))
  }

  getByType(type?: BusinessType, relations?: string[]) {
    let params = new HttpParams()
    if (type) {
      params = params.append('$query', JSON.stringify({ where: { type }, relations }))
    }

    return this.selectOrganizationId().pipe(
      switchMap(() => this.httpClient
        .get<{ items: IFavorite[]; total: number }>(C_URI_API_FAVORITES, { params })
        .pipe(map(({ items }) => items))
      )
    )
  }

  create(input: Partial<IFavorite>) {
    return this.httpClient.post(C_URI_API_FAVORITES, input)
  }

  delete(id: string) {
    return this.httpClient.delete(C_URI_API_FAVORITES + `/${id}`)
  }

  getProjectBookmarks(projectId: string, type?: BusinessType, relations?: string[]) {
    let params = new HttpParams()
    const conditions = { projectId } as any
    if (type) {
      conditions.type = type
    }
    params = params.append('$query', JSON.stringify({ where: conditions, relations }))

    return this.selectOrganizationId().pipe(
      switchMap(() => this.httpClient
        .get<{ items: IFavorite[]; total: number }>(C_URI_API_FAVORITES, { params })
        .pipe(map(({ items }) => items))
      )
    )
  }
}
