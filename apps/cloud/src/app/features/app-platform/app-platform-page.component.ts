import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { AIPermissionsEnum, Store } from '../../@core/state'
import { AppPlatformService } from '../../@core/services/app-platform.service'
import { applicationReturnUrl } from './app-platform-navigation'

@Component({
  standalone: true,
  selector: 'xp-app-platform-page',
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 items-center justify-center p-6' },
  template: `
    <main class="w-full max-w-xl space-y-5 rounded-xl border border-border bg-card p-8 text-card-foreground">
      <h1 class="text-2xl font-semibold">
        {{ platform.status()?.branding?.name || ('AppPlatform.Welcome' | translate) }}
      </h1>
      <p class="text-muted-foreground" role="status">
        {{ (error() ? 'AppPlatform.Unavailable' : 'AppPlatform.Preparing') | translate }}
      </p>
      @for (app of platform.status()?.apps; track app.key) {
        <div class="flex items-center justify-between gap-4">
          <span>{{ app.entries[0]?.title || app.key }}</span>
          <span class="text-sm text-muted-foreground">{{ 'AppPlatform.Status.' + app.status | translate }}</span>
        </div>
      }
      <button
        type="button"
        class="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        [disabled]="busy()"
        (click)="refresh(true)"
      >
        {{ 'AppPlatform.Retry' | translate }}
      </button>
    </main>
  `
})
export class AppPlatformPageComponent implements OnInit {
  readonly platform = inject(AppPlatformService)
  readonly error = signal(false)
  readonly busy = signal(false)
  private readonly store = inject(Store)
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)
  private readonly destroy = inject(DestroyRef)
  private timer: ReturnType<typeof setTimeout> | undefined
  constructor() {
    this.destroy.onDestroy(() => clearTimeout(this.timer))
  }
  ngOnInit() {
    void this.refresh()
  }
  async refresh(retry = false) {
    if (this.busy()) return
    clearTimeout(this.timer)
    this.busy.set(true)
    try {
      if (
        !this.store.user?.role?.rolePermissions?.some(
          (item) => item.enabled && item.permission === AIPermissionsEnum.CHAT_VIEW
        )
      ) {
        this.error.set(true)
        return
      }
      const status = await this.platform.refresh(retry)
      this.error.set(status.apps.some((app) => app.required && (app.status === 'failed' || app.status === 'blocked')))
      const home = status.apps.find((app) => app.key === status.home)?.entries[0]
      if (status.ready && home && !this.destroy.destroyed) {
        const returnUrl = applicationReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'), status)
        if (returnUrl) await this.router.navigateByUrl(returnUrl, { replaceUrl: true })
        else await this.router.navigate(['/chat/x', home.slug || home.id], { replaceUrl: true })
      } else if (!this.error() && !this.destroy.destroyed) {
        this.timer = setTimeout(() => void this.refresh(), 3000)
      }
    } catch {
      this.error.set(true)
    } finally {
      this.busy.set(false)
    }
  }
}
