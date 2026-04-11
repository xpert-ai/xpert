import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { IUser, IUserFindInput, IUserMeFeatures, IUserPasswordInput, IUserUpdateInput } from '@xpert-ai/contracts'
import { firstValueFrom, map } from 'rxjs'
import { API_PREFIX } from './constants'

@Injectable({
  providedIn: 'root'
})
export class UsersService {
  constructor(private http: HttpClient) {}

  API_URL = `${API_PREFIX}/user`

  getMe(): Promise<IUser> {
    return firstValueFrom(this.http.get<IUser>(`${this.API_URL}/me`))
  }

  getMeFeatures(): Promise<IUserMeFeatures> {
    return firstValueFrom(this.http.get<IUserMeFeatures>(`${this.API_URL}/me/features`))
  }

  mergeMeFeatures(user: IUser, features: IUserMeFeatures): IUser {
    const organizationFeatures = new Map(
      (features.organizationFeatures ?? []).map(({ organizationId, featureOrganizations }) => [
        organizationId,
        featureOrganizations
      ])
    )

    return {
      ...user,
      tenant: user.tenant
        ? {
            ...user.tenant,
            featureOrganizations: features.tenantFeatureOrganizations ?? []
          }
        : user.tenant,
      organizations: (user.organizations ?? []).map((membership) => ({
        ...membership,
        organization: membership.organization
          ? {
              ...membership.organization,
              featureOrganizations: organizationFeatures.get(membership.organizationId) ?? []
            }
          : membership.organization
      }))
    }
  }

  getUserByEmail(emailId: string): Promise<IUser> {
    return firstValueFrom(this.http.get<IUser>(`${this.API_URL}/email/${emailId}`))
  }

  getUserById(id: string, relations?: string[]): Promise<IUser> {
    const data = JSON.stringify({ relations })
    return firstValueFrom(
      this.http.get<IUser>(`${this.API_URL}/${id}`, {
        params: { data }
      })
    )
  }

  getAll(relations?: string[], findInput?: IUserFindInput, search?: string) {
    const data = JSON.stringify({ relations, findInput, search })
    return this.http.get<{ items: IUser[]; total: number }>(`${this.API_URL}`, {
        params: { data }
      }).pipe(map(({items}) => items))
  }

  search(search: string, options?: { organizationId?: string; membership?: string }) {
    const params: Record<string, string> = { search }
    if (options?.organizationId) {
      params.organizationId = options.organizationId
    }
    if (options?.membership) {
      params.membership = options.membership
    }

    return this.http.get<{ items: IUser[]; total: number }>(`${this.API_URL}/search`, {
        params
      }).pipe(
        map(({items}) => items)
      )
  }

  update(userId: string, updateInput: IUserUpdateInput) {
    return firstValueFrom(this.http.put(`${this.API_URL}/${userId}`, updateInput))
  }

  updateMe(updateInput: IUserUpdateInput) {
    return this.http.put<IUser>(`${this.API_URL}/me`, updateInput)
  }

  delete(userId: string,) {
    return this.http.delete(`${this.API_URL}/${userId}`)
  }

  password(userId: string, input: IUserPasswordInput) {
    return this.http.post(`${this.API_URL}/${userId}/password`, input)
  }

  deleteAllData(userId) {
    return firstValueFrom(this.http.delete(`${this.API_URL}/reset/${userId}`))
  }

  updatePreferredLanguage(userId: string, updateInput: IUserUpdateInput) {
    return firstValueFrom(this.http.put(`${this.API_URL}/preferred-language/${userId}`, updateInput))
  }

  updatePreferredComponentLayout(userId: string, updateInput: IUserUpdateInput) {
    return firstValueFrom(this.http.put(`${this.API_URL}/preferred-layout/${userId}`, updateInput))
  }

  createBulk(users: IUserUpdateInput[]) {
    return this.http.post<IUser[]>(this.API_URL + `/bulk`, users)
  }

  uploadAndParseCsv(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return this.http.post<IUserUpdateInput[]>(this.API_URL + `/bulk/upload`, formData)
  }
}
