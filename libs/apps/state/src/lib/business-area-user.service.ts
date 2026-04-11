import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { BusinessAreaRole, IBusinessAreaUser, IBusinessAreaUserCreateInput } from '@xpert-ai/contracts'
import { firstValueFrom, map } from 'rxjs'
import { C_API_BUSINESS_AREA_USER } from './constants'

@Injectable({
  providedIn: 'root'
})
export class BusinessAreaUserService {
  constructor(private http: HttpClient) {}

  getAll(relations?: string[], findInput?) {
    const data = JSON.stringify({ relations, findInput })

    return this.http.get<{ items: IBusinessAreaUser[]; total: number }>(`${C_API_BUSINESS_AREA_USER}`, {
      params: { data }
    }).pipe(map(({items}) => items))
  }

  getMy(relations?: string[], findInput?) {
    const data = JSON.stringify({ relations, findInput })

    return this.http.get<{ items: IBusinessAreaUser[]; total: number }>(`${C_API_BUSINESS_AREA_USER}/my`, {
      params: { data }
    }).pipe(map(({items}) => items))
  }

  getAllByBusinessArea(id: string, relations?: string[]) {
    return this.getAll(relations, { businessAreaId: id })
  }

  getUserOrganizationCount(id: string): Promise<number> {
    return firstValueFrom(this.http.get<number>(`${C_API_BUSINESS_AREA_USER}/${id}`))
  }

  create(input: IBusinessAreaUserCreateInput) {
    return this.http.post(C_API_BUSINESS_AREA_USER, input)
  }

  createBatch(id: string, users: {id: string, role: BusinessAreaRole}[]) {
    return this.http.post(C_API_BUSINESS_AREA_USER + `/${id}`, users)
  }

  delete(id: string) {
    return this.http.delete(C_API_BUSINESS_AREA_USER + `/${id}`)
  }
}
