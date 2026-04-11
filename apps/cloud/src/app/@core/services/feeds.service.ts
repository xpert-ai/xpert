import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { OrganizationBaseService } from '@xpert-ai/cloud/state'
import { map, switchMap } from 'rxjs/operators'
import { API_FEEDS } from '../constants/app.constants'

@Injectable({
  providedIn: 'root'
})
export class FeedsService extends OrganizationBaseService {
  constructor(private httpClient: HttpClient) {
    super()
  }

  public getAll() {
    return this.selectOrganizationId().pipe(
      switchMap(() => this.httpClient.get<{ items: any[] }>(API_FEEDS).pipe(map(({ items }) => items)))
    )
  }

  public create(entity: any) {
    return this.httpClient.post<any>(API_FEEDS, entity)
  }

  public update(id: string, entity: any) {
    return this.httpClient.put(API_FEEDS + `/${id}`, entity)
  }

  public delete(id: string) {
    return this.httpClient.delete(API_FEEDS + `/${id}`)
  }

  public search(text: string) {
    return this.httpClient.get<any>(API_FEEDS + '/search', { params: { text } })
  }
}
