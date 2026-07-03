import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { IUser, IUserFindInput, IUserPasswordInput, IUserUpdateInput, UserType } from '@xpert-ai/contracts'
import { firstValueFrom, map } from 'rxjs'
import { API_PREFIX } from './constants'

// Backend already includes employee/role/rolePermissions/tenant for /user/me by default.
export const CURRENT_USER_BOOTSTRAP_RELATIONS = ['organizations', 'organizations.organization'] as const

export const CURRENT_USER_FEATURE_RELATIONS = [
  'tenant.featureOrganizations',
  'tenant.featureOrganizations.feature',
  'organizations.organization.featureOrganizations',
  'organizations.organization.featureOrganizations.feature'
] as const

export const CURRENT_USER_FULL_RELATIONS = [
  ...CURRENT_USER_BOOTSTRAP_RELATIONS,
  ...CURRENT_USER_FEATURE_RELATIONS
] as const

export type UserMeSelect = {
  [field: string]: true | UserMeSelect
}

export type UserMeOptions = {
  currentOrganizationId?: string | null
  limitOrganizations?: boolean
}

export type UserListOptions = {
  types?: UserType[]
  withDeleted?: boolean
}

export const CURRENT_USER_BOOTSTRAP_SELECT: UserMeSelect = {
  id: true,
  email: true,
  username: true,
  firstName: true,
  lastName: true,
  mobile: true,
  imageUrl: true,
  timeZone: true,
  tenantId: true,
  preferredLanguage: true,
  role: {
    id: true,
    name: true,
    rolePermissions: {
      id: true,
      permission: true,
      enabled: true
    }
  },
  tenant: {
    id: true,
    name: true
  },
  employee: {
    id: true,
    userId: true,
    organizationId: true,
    isActive: true
  },
  organizations: {
    id: true,
    userId: true,
    tenantId: true,
    organizationId: true,
    isDefault: true,
    isActive: true,
    preferences: true,
    organization: {
      id: true,
      name: true,
      imageUrl: true,
      isDefault: true,
      isActive: true,
      defaultValueDateType: true,
      allowManualTime: true,
      allowModifyTime: true,
      allowDeleteTime: true,
      futureDateAllowed: true
    }
  }
}

export const CURRENT_USER_ORGANIZATIONS_SELECT: UserMeSelect = {
  id: true,
  tenantId: true,
  organizations: {
    id: true,
    userId: true,
    tenantId: true,
    organizationId: true,
    isDefault: true,
    isActive: true,
    preferences: true,
    organization: {
      id: true,
      name: true,
      imageUrl: true,
      isDefault: true,
      isActive: true,
      defaultValueDateType: true,
      allowManualTime: true,
      allowModifyTime: true,
      allowDeleteTime: true,
      futureDateAllowed: true
    }
  }
}

@Injectable({
  providedIn: 'root'
})
export class UsersService {
  constructor(private http: HttpClient) {}

  API_URL = `${API_PREFIX}/user`

  getMe(relations?: string[], select?: UserMeSelect, options?: UserMeOptions): Promise<IUser> {
    if (!relations?.length && !select && !options) {
      return firstValueFrom(this.http.get<IUser>(`${this.API_URL}/me`))
    }

    const data = JSON.stringify({
      ...(relations?.length ? { relations } : {}),
      ...(select ? { select } : {}),
      ...(options ?? {})
    })
    return firstValueFrom(
      this.http.get<IUser>(`${this.API_URL}/me`, {
        params: { data }
      })
    )
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

  getAll(relations?: string[], findInput?: IUserFindInput, search?: string, options?: UserListOptions) {
    const data = JSON.stringify({ relations, findInput, search, ...(options ?? {}) })
    return this.http
      .get<{ items: IUser[]; total: number }>(`${this.API_URL}`, {
        params: { data }
      })
      .pipe(map(({ items }) => items))
  }

  search(search: string, options?: { organizationId?: string; membership?: string }) {
    const params: Record<string, string> = { search }
    if (options?.organizationId) {
      params.organizationId = options.organizationId
    }
    if (options?.membership) {
      params.membership = options.membership
    }

    return this.http
      .get<{ items: IUser[]; total: number }>(`${this.API_URL}/search`, {
        params
      })
      .pipe(map(({ items }) => items))
  }

  update(userId: string, updateInput: IUserUpdateInput) {
    return firstValueFrom(this.http.put(`${this.API_URL}/${userId}`, updateInput))
  }

  updateMe(updateInput: IUserUpdateInput) {
    return this.http.put<IUser>(`${this.API_URL}/me`, updateInput)
  }

  delete(userId: string) {
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
