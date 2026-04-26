import { inject, Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService } from '@xpert-ai/cloud/state'
import { IUserGroup, PaginationParams } from '@xpert-ai/contracts'
import { toParams } from '@xpert-ai/core'
import { appendOrganizationIdQueryParam } from './query-params'

const API_USER_GROUP = API_PREFIX + '/user-groups'

@Injectable({ providedIn: 'root' })
export class UserGroupService extends OrganizationBaseCrudService<IUserGroup> {
  constructor() {
    super(API_USER_GROUP)
  }

  getAllByOrganization(organizationId: string, options?: PaginationParams<IUserGroup>) {
    return this.httpClient.get<{ items: IUserGroup[]; total: number }>(this.apiBaseUrl, {
      params: toParams({
        ...(options ?? {}),
        organizationId
      })
    })
  }

  override update(id: string, entity: Partial<IUserGroup>) {
    return this.httpClient.put<IUserGroup>(`${this.apiBaseUrl}/${id}`, entity)
  }

  updateMembers(id: string, memberIds: string[], organizationId?: string) {
    return this.httpClient.put<IUserGroup>(`${this.apiBaseUrl}/${id}/members`, memberIds, {
      params: appendOrganizationIdQueryParam(null, organizationId)
    })
  }
}

export function injectUserGroupAPI() {
  return inject(UserGroupService)
}
