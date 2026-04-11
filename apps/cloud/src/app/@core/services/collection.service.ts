import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_PREFIX } from '@xpert-ai/cloud/state'
import { map } from 'rxjs/operators'
import { ICollection } from '../types'

@Injectable({ providedIn: 'root' })
export class CollectionService {
  private httpClient = inject(HttpClient)

  getAll(projectId?: string) {
    return this.httpClient
      .get<{ items: ICollection[] }>(API_PREFIX + `/collection`, {
        params: new HttpParams({
          fromObject: {
            projectId
          }
        })
      })
      .pipe(map((result) => result.items))
  }

  create(input: Partial<ICollection>) {
    return this.httpClient.post<ICollection>(API_PREFIX + '/collection', input)
  }

  getOne(id: string) {
    return this.httpClient.get<ICollection>(API_PREFIX + `/collection/${id}`)
  }

  delete(id: string) {
    return this.httpClient.delete(API_PREFIX + `/collection/${id}`)
  }
}
