import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import {
  IOrganization,
  IOrganizationCreateInput,
  IOrganizationFindInput,
  OrgGenerateDemoOptions,
  OrganizationSelectInput
} from '@xpert-ai/contracts'
import { API_PREFIX } from '@xpert-ai/cloud/state'
import { Observable } from 'rxjs'

@Injectable({
  providedIn: 'root'
})
export class OrganizationsService {
  constructor(private http: HttpClient) {}

  create(createInput: IOrganizationCreateInput): Observable<IOrganization> {
    return this.http.post<IOrganization>(`${API_PREFIX}/organization`, createInput)
  }

  update(id: string, updateInput: Partial<IOrganizationCreateInput>) {
    return this.http.put<IOrganization>(`${API_PREFIX}/organization/${id}`, updateInput)
  }

  delete(id: string) {
    return this.http.delete(`${API_PREFIX}/organization/${id}`)
  }

  getAll(relations?: string[], findInput?: IOrganizationFindInput) {
    const data = JSON.stringify({ relations, findInput })
    return this.http.get<{ items: IOrganization[]; total: number }>(`${API_PREFIX}/organization`, {
      params: { data }
    })
  }

  getById(id: string = '', select?: OrganizationSelectInput[], relations?: string[]): Observable<IOrganization> {
    const data = JSON.stringify({ relations })
    return this.http.get<IOrganization>(`${API_PREFIX}/organization/${id}/${JSON.stringify(select || '')}`, {
      params: { data }
    })
  }

  getByProfileLink(
    profile_link: string = '',
    select?: OrganizationSelectInput[],
    relations?: string[]
  ): Observable<IOrganization> {
    const option = JSON.stringify(relations || '')
    return this.http.get<IOrganization>(
      `${API_PREFIX}/organization/profile/${profile_link}/${JSON.stringify(select || '')}/${option}`
    )
  }

  demo(id: string, body?: OrgGenerateDemoOptions) {
    return this.http.post(`${API_PREFIX}/organization/${id}/demo`, body)
  }
}
