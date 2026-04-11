import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { IPermissionApproval, IPermissionApprovalCreateInput, IPermissionApprovalFindInput } from '@xpert-ai/contracts'
import { API_PREFIX } from '@xpert-ai/cloud/state'
import { firstValueFrom } from 'rxjs'

@Injectable({
  providedIn: 'root'
})
export class PermissionApprovalService {
  PERMISSION_APPROVAL_URL = `${API_PREFIX}/permission-approval`

  constructor(private http: HttpClient) {}

  getMy(relations?: string[], findInput?: IPermissionApprovalFindInput) {
    const data = JSON.stringify({ relations, findInput })

    return this.http.get<{ items: IPermissionApproval[] }>(`${this.PERMISSION_APPROVAL_URL}/my`, {
      params: { data }
    })
  }

  getAllByProject(project: string, relations?: string[], where?: IPermissionApprovalFindInput) {
    const data = JSON.stringify({ relations, where, order: {updatedAt: 'DESC'} })

    return this.http.get<{ items: IPermissionApproval[] }>(`${this.PERMISSION_APPROVAL_URL}`, {
        params: {
          project,
          data
        }
      })
  }

  getAll(relations?: string[], findInput?: IPermissionApprovalFindInput) {
    const data = JSON.stringify({ relations, findInput })

    return this.http.get<{ items: IPermissionApproval[] }>(`${this.PERMISSION_APPROVAL_URL}`, {
        params: { data }
      })
  }

  save(requestApproval: IPermissionApprovalCreateInput): Promise<IPermissionApproval> {
    if (!requestApproval.id) {
      return firstValueFrom(this.http.post<IPermissionApproval>(this.PERMISSION_APPROVAL_URL, requestApproval))
    } else {
      return firstValueFrom(
        this.http.put<IPermissionApproval>(`${this.PERMISSION_APPROVAL_URL}/${requestApproval.id}`, requestApproval)
      )
    }
  }

  approval(id: string) {
    return this.http.put(`${this.PERMISSION_APPROVAL_URL}/approval/${id}`, null)
  }

  refuse(id: string) {
    return this.http.put(`${this.PERMISSION_APPROVAL_URL}/refuse/${id}`, null)
  }
}
