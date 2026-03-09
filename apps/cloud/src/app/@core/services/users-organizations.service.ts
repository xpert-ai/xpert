import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { IUserOrganization, IUserOrganizationCreateInput, IUserOrganizationFindInput } from '@metad/contracts'
import { API_PREFIX } from '@metad/cloud/state'
import { firstValueFrom, Observable } from 'rxjs'

@Injectable({
  providedIn: 'root'
})
export class UsersOrganizationsService {
  constructor(private http: HttpClient) {}

  getAll(
    relations?: string[],
    findInput?: IUserOrganizationFindInput
  ) {
    const data = JSON.stringify({ relations, findInput })

    return this.http.get<{ items: IUserOrganization[]; total: number }>(`${API_PREFIX}/user-organization`, {
        params: { data }
      })
  }

  setUserAsInactive(id: string): Promise<IUserOrganization> {
    return firstValueFrom(this.http
      .put<IUserOrganization>(`${API_PREFIX}/user-organization/${id}`, {
        isActive: false
      }))
  }

  getUserOrganizationCount(id: string): Promise<number> {
    return firstValueFrom(this.http.get<number>(`${API_PREFIX}/user-organization/${id}`))
  }

  removeUserFromOrg(id: string): Observable<IUserOrganization> {
    return this.http.delete<IUserOrganization>(`${API_PREFIX}/user-organization/${id}`)
  }

  create(createInput: IUserOrganizationCreateInput): Observable<IUserOrganization> {
    return this.http.post<IUserOrganization>(`${API_PREFIX}/user-organization`, createInput)
  }
}
