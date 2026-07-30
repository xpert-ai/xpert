import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { IPagination, IReferralCodeView, IReferralRelationQuery, IReferralRelationView } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { API_PREFIX } from './constants'

@Injectable({ providedIn: 'root' })
export class ReferralService {
  private readonly http = inject(HttpClient)
  private readonly apiUrl = `${API_PREFIX}/referral`

  getAvailability(tenantId?: string) {
    return firstValueFrom(
      this.http.get<boolean>(`${this.apiUrl}/availability`, {
        ...(tenantId ? { headers: { 'Tenant-Id': tenantId } } : {})
      })
    )
  }

  validateCode(code: string, tenantId?: string) {
    return firstValueFrom(
      this.http.get<boolean>(`${this.apiUrl}/validate`, {
        params: { code },
        ...(tenantId ? { headers: { 'Tenant-Id': tenantId } } : {})
      })
    )
  }

  getMyCode() {
    return firstValueFrom(this.http.get<IReferralCodeView>(`${this.apiUrl}/me`))
  }

  regenerateMyCode() {
    return firstValueFrom(this.http.post<IReferralCodeView>(`${this.apiUrl}/me/regenerate`, {}))
  }

  getRelations(query: IReferralRelationQuery) {
    let params = new HttpParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value))
      }
    }
    return firstValueFrom(
      this.http.get<IPagination<IReferralRelationView>>(`${this.apiUrl}/relations`, {
        params
      })
    )
  }
}
