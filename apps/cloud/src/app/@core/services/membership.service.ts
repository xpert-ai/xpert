import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { Store } from '@xpert-ai/cloud/state'
import {
  AiFeatureEnum,
  AiModelTypeEnum,
  ICopilotWithProvider,
  IMembershipMe,
  IMembershipPlan,
  IMembershipPointLedger,
  IMembershipScopeStatus,
  IMembershipUsageOverview,
  IMembershipUsageQuery,
  IMembershipUsageSummary,
  IPagination,
  IUserPersonalPoints,
  IUserMembership,
  TMembershipAssignInput,
  TMembershipPlanReassignInput,
  TMembershipPointAdjustInput
} from '@xpert-ai/contracts'
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap, tap } from 'rxjs'
import { API_COPILOT, API_MEMBERSHIP } from '../constants/app.constants'

@Injectable({ providedIn: 'root' })
export class MembershipService {
  readonly #http = inject(HttpClient)
  readonly #store = inject(Store)
  readonly #membershipStateRefresh = new BehaviorSubject<void>(undefined)

  getPlans() {
    return this.#http.get<IMembershipPlan[]>(`${API_MEMBERSHIP}/plans`)
  }

  getScopeStatus() {
    return this.#http.get<IMembershipScopeStatus>(`${API_MEMBERSHIP}/scope/status`)
  }

  getModelOptions() {
    return this.#http.get<ICopilotWithProvider[]>(`${API_COPILOT}/membership-models`, {
      params: { type: AiModelTypeEnum.LLM }
    })
  }

  initializeScope() {
    return this.#http
      .post<IMembershipScopeStatus>(`${API_MEMBERSHIP}/scope/initialize`, {})
      .pipe(tap(() => this.refreshMembershipState()))
  }

  createPlan(input: Partial<IMembershipPlan>) {
    return this.#http
      .post<IMembershipPlan>(`${API_MEMBERSHIP}/plans`, input)
      .pipe(tap(() => this.refreshMembershipState()))
  }

  updatePlan(id: string, input: Partial<IMembershipPlan>) {
    return this.#http
      .patch<IMembershipPlan>(`${API_MEMBERSHIP}/plans/${id}`, input)
      .pipe(tap(() => this.refreshMembershipState()))
  }

  archivePlan(id: string) {
    return this.#http
      .post<IMembershipPlan>(`${API_MEMBERSHIP}/plans/${id}/archive`, {})
      .pipe(tap(() => this.refreshMembershipState()))
  }

  deletePlan(id: string) {
    return this.#http.delete<void>(`${API_MEMBERSHIP}/plans/${id}`).pipe(tap(() => this.refreshMembershipState()))
  }

  getAdminUsers(params?: { userId?: string; planId?: string; take?: number; skip?: number }) {
    return this.#http.get<IPagination<IUserMembership>>(`${API_MEMBERSHIP}/admin/users`, {
      params: this.toParams(params)
    })
  }

  assignUser(userId: string, input: TMembershipAssignInput) {
    return this.#http
      .post<IUserMembership>(`${API_MEMBERSHIP}/admin/users/${userId}/assign`, input)
      .pipe(tap(() => this.refreshMembershipState()))
  }

  adjustUserPoints(userId: string, input: TMembershipPointAdjustInput) {
    return this.#http
      .post<IUserMembership>(`${API_MEMBERSHIP}/admin/users/${userId}/adjust-points`, input)
      .pipe(tap(() => this.refreshMembershipState()))
  }

  renewUser(userId: string) {
    return this.#http
      .post<IUserMembership>(`${API_MEMBERSHIP}/admin/users/${userId}/renew`, {})
      .pipe(tap(() => this.refreshMembershipState()))
  }

  pauseUser(userId: string) {
    return this.#http
      .post<IUserMembership>(`${API_MEMBERSHIP}/admin/users/${userId}/pause`, {})
      .pipe(tap(() => this.refreshMembershipState()))
  }

  resumeUser(userId: string) {
    return this.#http
      .post<IUserMembership>(`${API_MEMBERSHIP}/admin/users/${userId}/resume`, {})
      .pipe(tap(() => this.refreshMembershipState()))
  }

  revokeUser(userId: string) {
    return this.#http
      .post<IUserMembership>(`${API_MEMBERSHIP}/admin/users/${userId}/revoke`, {})
      .pipe(tap(() => this.refreshMembershipState()))
  }

  getPersonalPoints(userId: string) {
    return this.#http.get<IUserPersonalPoints>(`${API_MEMBERSHIP}/admin/users/${userId}/personal-points`)
  }

  adjustPersonalPoints(userId: string, input: TMembershipPointAdjustInput) {
    return this.#http
      .post<IUserPersonalPoints>(`${API_MEMBERSHIP}/admin/users/${userId}/adjust-personal-points`, input)
      .pipe(tap(() => this.refreshMembershipState()))
  }

  reassignPlanMembers(planId: string, input: TMembershipPlanReassignInput) {
    return this.#http
      .post<{ updated: number }>(`${API_MEMBERSHIP}/plans/${planId}/reassign`, input)
      .pipe(tap(() => this.refreshMembershipState()))
  }

  getMe() {
    return this.#http.get<IMembershipMe | null>(`${API_MEMBERSHIP}/me`)
  }

  hasActiveMembershipInScope() {
    return combineLatest([
      this.#store.selectOrganizationId(),
      this.#store.selectHasFeatureEnabled(AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN),
      this.#membershipStateRefresh
    ]).pipe(
      switchMap(([, featureEnabled]) =>
        featureEnabled
          ? this.getMe().pipe(
          map((membership) => !!membership),
          catchError(() => of(false))
        )
          : of(false)
      )
    )
  }

  refreshMembershipState() {
    this.#membershipStateRefresh.next()
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
