import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { API_PREFIX, Store } from '@metad/cloud/state'
import { firstValueFrom, Observable } from 'rxjs'
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators'
import { IUserOrganization, IUserOrganizationCreateInput, IUserOrganizationFindInput } from '../types'

@Injectable({
  providedIn: 'root'
})
export class UsersOrganizationsService {
  private http = inject(HttpClient)
  private readonly store = inject(Store)
  private readonly organizationId$ = this.store.selectOrganizationId().pipe(
    map((organizationId) => organizationId ?? null),
    distinctUntilChanged()
  )

  selectOrganizationId() {
    return this.organizationId$
  }

  getAll(
    relations?: string[],
    findInput?: IUserOrganizationFindInput
  ) {
    const data = JSON.stringify({ relations, findInput })

    return this.http.get<{ items: IUserOrganization[]; total: number }>(`${API_PREFIX}/user-organization`, {
        params: { data }
      })
  }

  getAllInOrg(
    relations?: string[],
    findInput?: IUserOrganizationFindInput
  ) {
    return this.selectOrganizationId().pipe(
      switchMap((organizationId) =>
        this.getAll(relations, {
          ...(findInput ?? {}),
          organizationId
        })
      )
    )
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
