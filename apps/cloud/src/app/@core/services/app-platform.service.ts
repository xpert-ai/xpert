import { HttpClient } from '@angular/common/http'
import { Injectable, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslateService } from '@ngx-translate/core'
import { AIPermissionsEnum, AppPlatformDefinition, AppPlatformStatus } from '@xpert-ai/contracts'
import { ZardToastService } from '@xpert-ai/headless-ui'
import { distinctUntilChanged, firstValueFrom, map } from 'rxjs'
import { API_PREFIX, Store } from '../state'
import { XpertAPIService } from './xpert.service'

@Injectable({ providedIn: 'root' })
export class AppPlatformService {
  private readonly http = inject(HttpClient)
  private readonly store = inject(Store)
  private readonly toast = inject(ZardToastService)
  private readonly translate = inject(TranslateService)
  private readonly assistants = inject(XpertAPIService)
  private revision = 0
  private retrying = false
  private noticeKey: string | null = null
  private notice: ReturnType<ZardToastService['warning']> | undefined
  readonly status = signal<AppPlatformStatus | null>(null)
  readonly branding = signal<AppPlatformDefinition['branding'] | null>(null)
  constructor() {
    this.store.user$
      .pipe(
        map((user) => user?.id),
        distinctUntilChanged(),
        takeUntilDestroyed()
      )
      .subscribe(() => {
        this.revision++
        this.status.set(null)
        this.notice?.dismiss()
        this.notice = undefined
        this.noticeKey = null
        this.retrying = false
      })
  }
  async refresh(retry = false) {
    const revision = this.revision
    const status = await firstValueFrom(
      retry
        ? this.http.post<AppPlatformStatus>(`${API_PREFIX}/app-platform/retry`, {})
        : this.http.get<AppPlatformStatus>(`${API_PREFIX}/app-platform/me`)
    )
    if (revision !== this.revision) throw new Error('Application account changed')
    const entries = (value: AppPlatformStatus | null) =>
      JSON.stringify([value?.organizationId, value?.apps.flatMap((app) => app.entries.map((entry) => entry.id)).sort()])
    const changed = entries(this.status()) !== entries(status)
    this.status.set(status)
    if (changed) this.assistants.refresh()
    this.notifyOptionalFailure(status)
    return status
  }
  private notifyOptionalFailure(status: AppPlatformStatus) {
    const allowed = this.store.user?.role?.rolePermissions?.some(
      (item) => item.enabled && item.permission === AIPermissionsEnum.CHAT_VIEW
    )
    const failed = status.apps.filter((app) => !app.required && ['failed', 'blocked'].includes(app.status))
    if (!allowed || !status.ready || !failed.length) {
      this.notice?.dismiss()
      this.notice = undefined
      this.noticeKey = null
      return
    }
    const key = JSON.stringify([
      this.store.user?.id,
      status.organizationId,
      status.version,
      failed.map((app) => app.key).sort()
    ])
    if (key === this.noticeKey) return
    this.notice?.dismiss()
    this.noticeKey = key
    this.notice = this.toast.warning(
      this.translate.instant('AppPlatform.OptionalUnavailable', { count: failed.length }),
      {
        duration: Number.POSITIVE_INFINITY,
        closeButton: true,
        action: {
          label: this.translate.instant('AppPlatform.Retry'),
          onClick: () => {
            void this.retryOptionalApplications()
          }
        }
      }
    )
  }
  private async retryOptionalApplications() {
    if (this.retrying) return
    this.retrying = true
    const revision = this.revision
    try {
      this.toast.info(this.translate.instant('AppPlatform.Preparing'))
      for (let attempt = 0; attempt < 20; attempt++) {
        if (attempt) await new Promise((resolve) => setTimeout(resolve, 3000))
        if (this.revision !== revision) return
        const status = await this.refresh(attempt === 0)
        if (status.apps.every((app) => app.required || ['ready', 'disabled'].includes(app.status))) return
      }
    } catch {
      if (this.revision === revision) this.toast.error(this.translate.instant('AppPlatform.Unavailable'))
    } finally {
      if (this.revision === revision) {
        this.retrying = false
        this.noticeKey = null
        if (this.status()) this.notifyOptionalFailure(this.status())
      }
    }
  }
  async presentation() {
    const result = await firstValueFrom(
      this.http.get<{ mode: 'standard' | 'managed-apps'; branding?: AppPlatformDefinition['branding'] }>(
        `${API_PREFIX}/app-platform/presentation`
      )
    )
    this.branding.set(result.branding ?? null)
    return result
  }
}
