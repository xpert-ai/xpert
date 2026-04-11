import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { IPagination, IRole, ITenant, RolesEnum } from '@xpert-ai/contracts'
import { API_PREFIX } from '@xpert-ai/cloud/state';
import { Observable } from 'rxjs'

@Injectable({
  providedIn: 'root'
})
export class RoleService {
  constructor(private http: HttpClient) {}

  getRoleByName(findInput?: { name: RolesEnum; tenantId?: ITenant['id'] }): Observable<IRole> {
    const data = JSON.stringify({ findInput })
    return this.http.get<IRole>(`${API_PREFIX}/roles/find`, {
      params: { data }
    })
  }

  getAll() {
    return this.http.get<IPagination<IRole>>(`${API_PREFIX}/roles`)
  }

  create(role: IRole): Observable<IRole> {
    return this.http.post<IRole>(`${API_PREFIX}/roles`, {
      ...role
    })
  }

  update(id: string, role: Partial<IRole>): Observable<IRole> {
    return this.http.put<IRole>(`${API_PREFIX}/roles/${id}`, role)
  }

  delete(role: IRole): Observable<IRole> {
    return this.http.delete<IRole>(`${API_PREFIX}/roles/${role.id}`)
  }

  getRoleById(roleId: string) {
    return this.http.get<IRole>(`${API_PREFIX}/roles/${roleId}`)
  }
}
