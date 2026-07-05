import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import {
  IMembershipMe,
  IMembershipPlan,
  IMembershipPointLedger,
  IMembershipUsageOverview,
  IMembershipUsageQuery,
  IMembershipUsageSummary,
  IPagination,
  IUserMembership,
  TMembershipAssignInput,
  TMembershipPointAdjustInput
} from '@xpert-ai/contracts'
import { API_MEMBERSHIP } from '../constants/app.constants'

@Injectable({ providedIn: 'root' })
export class MembershipService {
  readonly #http = inject(HttpClient)

  getPlans() {
    return this.#http.get<IMembershipPlan[]>(`${API_MEMBERSHIP}/plans`)
  }

  createPlan(input: Partial<IMembershipPlan>) {
    return this.#http.post<IMembershipPlan>(`${API_MEMBERSHIP}/plans`, input)
  }

  updatePlan(id: string, input: Partial<IMembershipPlan>) {
    return this.#http.patch<IMembershipPlan>(`${API_MEMBERSHIP}/plans/${id}`, input)
  }

  archivePlan(id: string) {
    return this.#http.post<IMembershipPlan>(`${API_MEMBERSHIP}/plans/${id}/archive`, {})
  }

  getAdminUsers(params?: { userId?: string; take?: number; skip?: number }) {
    return this.#http.get<IPagination<IUserMembership>>(`${API_MEMBERSHIP}/admin/users`, {
      params: this.toParams(params)
    })
  }

  assignUser(userId: string, input: TMembershipAssignInput) {
    return this.#http.post<IUserMembership>(`${API_MEMBERSHIP}/admin/users/${userId}/assign`, input)
  }

  adjustUserPoints(userId: string, input: TMembershipPointAdjustInput) {
    return this.#http.post<IUserMembership>(`${API_MEMBERSHIP}/admin/users/${userId}/adjust-points`, input)
  }

  renewUser(userId: string) {
    return this.#http.post<IUserMembership>(`${API_MEMBERSHIP}/admin/users/${userId}/renew`, {})
  }

  getMe() {
    return this.#http.get<IMembershipMe | null>(`${API_MEMBERSHIP}/me`)
  }

  getOverview(query?: IMembershipUsageQuery) {
    return this.#http.get<IMembershipUsageOverview | null>(`${API_MEMBERSHIP}/me/overview`, {
      params: this.toParams(query)
    })
  }

  getMyUsage(query?: IMembershipUsageQuery & { take?: number; skip?: number }) {
    return this.#http.get<IPagination<IMembershipPointLedger>>(`${API_MEMBERSHIP}/me/usage`, {
      params: this.toParams(query)
    })
  }

  getMyUsageSummary(query?: IMembershipUsageQuery & { take?: number; skip?: number }) {
    return this.#http.get<IPagination<IMembershipUsageSummary>>(`${API_MEMBERSHIP}/me/usage-summary`, {
      params: this.toParams(query)
    })
  }

  getMyDetails(query?: IMembershipUsageQuery) {
    return this.#http.post<IPagination<IMembershipPointLedger>>(`${API_MEMBERSHIP}/me/details`, query ?? {})
  }

  private toParams(params?: object) {
    let httpParams = new HttpParams()
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(
          key.startsWith('$') ? key : key === 'take' || key === 'skip' ? `$${key}` : key,
          String(value)
        )
      }
    }
    return httpParams
  }
}
