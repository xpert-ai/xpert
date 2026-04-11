import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { API_PREFIX } from '@xpert-ai/cloud/state'
import { map } from 'rxjs/operators'
import { ICertification } from '../types'

const API_CERTIFICATION = API_PREFIX + '/certification'

@Injectable({ providedIn: 'root' })
export class CertificationService {
  private httpClient = inject(HttpClient)

  getAll(relations: string[] = []) {
    return this.httpClient
      .get<{ items: ICertification[] }>(API_CERTIFICATION, {
        params: new HttpParams({
          fromObject: {
            data: JSON.stringify({
              relations
            })
          }
        })
      })
      .pipe(map((result) => result.items))
  }

  create(input: Partial<ICertification>) {
    return this.httpClient.post<ICertification>(API_CERTIFICATION, input)
  }

  getOne(id: string) {
    return this.httpClient.get<ICertification>(API_CERTIFICATION + `/${id}`)
  }

  update(id: string, input: Partial<ICertification>) {
    return this.httpClient.put<ICertification>(API_CERTIFICATION + `/${id}`, input)
  }

  delete(id: string) {
    return this.httpClient.delete(API_CERTIFICATION + `/${id}`)
  }
}
