import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { IDataSource, IDataSourceAuthentication } from '@xpert-ai/contracts'
import { map, Observable, switchMap } from 'rxjs'
import { C_API_DATA_SOURCE } from './constants'
import { OrganizationBaseService } from './organization-base.service'

@Injectable({
  providedIn: 'root'
})
export class DataSourceService extends OrganizationBaseService {
  constructor(private http: HttpClient) {
    super()
  }

  getAll(relations: string[] = []) {
    let params = new HttpParams()
    const query = JSON.stringify({ relations, order: { updatedAt: 'DESC' } })
    params = params.append('$query', query)

    return this.selectOrganizationId().pipe(
      switchMap(() => {
        return this.http.get<{ items: IDataSource[]; totals: number }>(C_API_DATA_SOURCE, {
          params
        }).pipe(map(({items}) => items))
      })
    )
  }

  getOne(id: string) {
    return this.http.get<IDataSource>(C_API_DATA_SOURCE + `/${id}`, { params: {
      $query: JSON.stringify({
        relations: ['type']
      })
    }})
  }

  create(data: Partial<IDataSource>) {
    return this.http.post(C_API_DATA_SOURCE, data)
  }

  update(id: string, updateInput: any) {
    return this.http.put(`${C_API_DATA_SOURCE}/${id}`, updateInput)
  }

  delete(id: string) {
    return this.http.delete(`${C_API_DATA_SOURCE}/${id}`)
  }

  ping(dataSource: Partial<IDataSource>): Observable<any>;
  ping(id: string | Partial<IDataSource>, dataSource: Partial<IDataSource>): Observable<any>;
  ping(id: string | Partial<IDataSource>, dataSource?: Partial<IDataSource>): Observable<any> {
    if (typeof id === 'string') {
      return this.http.post(`${C_API_DATA_SOURCE}/${id}/ping`, dataSource)
    }
    return this.http.post(`${C_API_DATA_SOURCE}/ping`, id)
  }

  getAuthentication(id: string) {
    return this.http.get<IDataSourceAuthentication>(`${C_API_DATA_SOURCE}/${id}/authentication`)
  }

  createAuthentication(id: string, auth: IDataSourceAuthentication) {
    return this.http.post(`${C_API_DATA_SOURCE}/${id}/authentication`, auth)
  }

  deleteAuthentication(id: string) {
    return this.http.delete(`${C_API_DATA_SOURCE}/${id}/authentication`)
  }

  dataLoad(id: string, params: any[], file: File) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('params', JSON.stringify(params))
    return this.http.post(`${C_API_DATA_SOURCE}/${id}/load`, formData)
  }
}
