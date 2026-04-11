import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { IRolePermission, IRolePermissionCreateInput, IRolePermissionUpdateInput } from '@xpert-ai/contracts'
import { API_PREFIX } from '@xpert-ai/cloud/state'
import { lastValueFrom, Observable } from 'rxjs'

@Injectable({
  providedIn: 'root'
})
export class RolePermissionsService {
  constructor(public httpClient: HttpClient) {}

  selectRolePermissions(findInput?: any): Promise<{ items: IRolePermission[]; total: number }> {
    const data = JSON.stringify({ findInput })
    return lastValueFrom(
      this.httpClient.get<any>(`${API_PREFIX}/role-permissions`, {
        params: { data }
      })
    )
  }

  create(createInput: IRolePermissionCreateInput): Observable<IRolePermission> {
    return this.httpClient.post<IRolePermission>(`${API_PREFIX}/role-permissions`, createInput)
  }

  update(id: string, updateInput: IRolePermissionUpdateInput) {
    return this.httpClient.put(`${API_PREFIX}/role-permissions/${id}`, updateInput)
  }
}
