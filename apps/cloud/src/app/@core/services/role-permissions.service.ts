import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { IRolePermission, IRolePermissionCreateInput, IRolePermissionUpdateInput } from '@xpert-ai/contracts'
import { API_PREFIX } from '@xpert-ai/cloud/state'
import { lastValueFrom, Observable } from 'rxjs'

export interface IRolePermissionSyncDefaultsResult {
  tenantId: string
  inserted: number
  enabled: number
  roles: Array<{
    role: string
    roleId: string
    inserted: number
    enabled: number
    existing: number
  }>
}

@Injectable({
  providedIn: 'root'
})
export class RolePermissionsService {
  readonly #httpClient = inject(HttpClient)

  selectRolePermissions(findInput?: Record<string, unknown>): Promise<{ items: IRolePermission[]; total: number }> {
    const data = JSON.stringify({ findInput })
    return lastValueFrom(
      this.#httpClient.get<{ items: IRolePermission[]; total: number }>(`${API_PREFIX}/role-permissions`, {
        params: { data }
      })
    )
  }

  create(createInput: IRolePermissionCreateInput): Observable<IRolePermission> {
    return this.#httpClient.post<IRolePermission>(`${API_PREFIX}/role-permissions`, createInput)
  }

  update(id: string, updateInput: IRolePermissionUpdateInput) {
    return this.#httpClient.put(`${API_PREFIX}/role-permissions/${id}`, updateInput)
  }

  syncDefaults() {
    return this.#httpClient.post<IRolePermissionSyncDefaultsResult>(`${API_PREFIX}/role-permissions/sync-defaults`, {})
  }
}
